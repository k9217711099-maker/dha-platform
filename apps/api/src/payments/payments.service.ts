import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Booking, BookingStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { PaymentGatewayPort } from '../integrations/yookassa/payment-gateway.port.js';
import { FiscalPort } from '../integrations/fiscal/fiscal.port.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { buildReceipt } from './receipt.builder.js';
import type { Receipt } from '../integrations/yookassa/yookassa.types.js';
import type { Env } from '../config/env.schema.js';
import {
  PAYMENT_METHODS_KEY,
  parsePaymentMethods,
  type PaymentMethod,
} from '../common/payments/payment-methods.js';

export interface CreatePaymentResult {
  paymentId: string;
  gatewayPaymentId: string;
  status: string;
  confirmationUrl: string | null;
  amount: number;
}

/** Маппинг статуса шлюза в наш PaymentStatus. */
function mapGatewayStatus(status: string): PaymentStatus | null {
  switch (status) {
    case 'succeeded':
      return PaymentStatus.PAID;
    case 'waiting_for_capture':
      return PaymentStatus.AUTHORIZED;
    case 'canceled':
      return PaymentStatus.FAILED;
    case 'refunded':
      return PaymentStatus.REFUNDED;
    default:
      return null;
  }
}

/** Платежи по бронированиям (YooKassa, 54-ФЗ). */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayPort,
    private readonly fiscal: FiscalPort,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Активный эквайер (для поля Payment.provider). */
  private activeProvider(): string {
    return (
      this.config.get('PAYMENT_PROVIDER', { infer: true }) ??
      (this.config.get('YOOKASSA_PROVIDER', { infer: true }) === 'yookassa' ? 'yookassa' : 'mock')
    );
  }

  /** Разрешённые способы оплаты из настроек (Настройки → Финансы). */
  private async allowedMethods(): Promise<PaymentMethod[]> {
    const s = await this.prisma.setting.findUnique({ where: { key: PAYMENT_METHODS_KEY } });
    return parsePaymentMethods(s?.value);
  }

  /** Создать платёж по брони (с чеком 54-ФЗ). Возвращает данные для перехода к оплате. */
  async createForBooking(guestId: string, bookingId: string): Promise<CreatePaymentResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, guestId },
      include: { property: true, guest: true },
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    if (booking.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('Бронирование уже оплачено');
    }

    const amount = Math.max(booking.totalPrice - booking.pointsRedeemed, 0) + booking.extrasTotal;
    if (amount <= 0) throw new BadRequestException('Сумма к оплате равна нулю');

    const description = `Проживание · ${booking.property.name} · ${booking.checkIn
      .toISOString()
      .slice(0, 10)}–${booking.checkOut.toISOString().slice(0, 10)}`;

    const result = await this.gateway.createPayment({
      amountRub: amount,
      currency: 'RUB',
      description,
      capture: true,
      bookingId: booking.id,
      returnUrl: this.config.get('PAYMENT_RETURN_URL', { infer: true }),
      receipt: buildReceipt({
        description,
        amountRub: amount,
        email: booking.guest.email,
        phone: booking.guest.phone,
      }),
      idempotenceKey: randomUUID(),
      allowedMethods: await this.allowedMethods(),
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId: booking.id,
          provider: this.activeProvider(),
          gatewayPaymentId: result.gatewayPaymentId,
          status: PaymentStatus.PENDING,
          amount,
        },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: PaymentStatus.PENDING },
      });
      return created;
    });

    return {
      paymentId: payment.id,
      gatewayPaymentId: result.gatewayPaymentId,
      status: result.status,
      confirmationUrl: result.confirmationUrl,
      amount,
    };
  }

  /**
   * Создать платёж по брони со стороны администратора (PMS): выставить гостю ссылку
   * на оплату/предоплату. В отличие от гостевого метода не требует guestId и позволяет
   * указать сумму (предоплата) — иначе берётся полный остаток. Возвращает ссылку оплаты.
   */
  async createForBookingByAdmin(bookingId: string, opts?: { amount?: number }): Promise<CreatePaymentResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId },
      include: { property: true, guest: true },
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    if (booking.paymentStatus === PaymentStatus.PAID) throw new ConflictException('Бронирование уже оплачено');

    const full = Math.max(booking.totalPrice - booking.pointsRedeemed, 0) + booking.extrasTotal;
    const amount = opts?.amount != null ? Math.round(opts.amount) : full;
    if (amount <= 0) throw new BadRequestException('Сумма к оплате равна нулю');
    if (amount > full) throw new BadRequestException('Сумма превышает остаток к оплате');

    const isPrepay = amount < full;
    const description = `${isPrepay ? 'Предоплата' : 'Оплата'} · ${booking.property.name} · ${booking.checkIn
      .toISOString().slice(0, 10)}–${booking.checkOut.toISOString().slice(0, 10)}`;

    const result = await this.gateway.createPayment({
      amountRub: amount,
      currency: 'RUB',
      description,
      capture: true,
      bookingId: booking.id,
      returnUrl: this.config.get('PAYMENT_RETURN_URL', { infer: true }),
      receipt: buildReceipt({ description, amountRub: amount, email: booking.guest.email, phone: booking.guest.phone }),
      idempotenceKey: randomUUID(),
      allowedMethods: await this.allowedMethods(),
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: { bookingId: booking.id, provider: this.activeProvider(), gatewayPaymentId: result.gatewayPaymentId, status: PaymentStatus.PENDING, amount },
      });
      await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: PaymentStatus.PENDING } });
      return created;
    });

    return { paymentId: payment.id, gatewayPaymentId: result.gatewayPaymentId, status: result.status, confirmationUrl: result.confirmationUrl, amount };
  }

  /** История платежей по брони (вкладка «Счёт»). */
  async listForBooking(bookingId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, status: true, amount: true, refundedAmount: true, createdAt: true, paidAt: true, payerType: true, payerName: true, settlementKind: true, vatRate: true },
    });
    return rows.map((p) => ({ ...p, manual: p.provider.startsWith('manual:'), method: p.provider.startsWith('manual:') ? p.provider.slice(7) : null }));
  }

  /**
   * Ручная регистрация оплаты на стойке (наличные/карта/перевод) — создаёт оплаченный
   * платёж без шлюза. Если бронь покрыта полностью — статус оплаты PAID и подтверждение
   * (pending_payment → confirmed). Фискальный чек 54-ФЗ пробивается, если фискализация включена.
   */
  async recordManual(bookingId: string, dto: { amount: number; method: 'cash' | 'card' | 'transfer' | 'other'; payerType?: string; payerName?: string; settlementKind?: string; vatRate?: number; paidAt?: string }): Promise<{ paymentId: string; paid: number; remaining: number }> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { property: true, guest: true } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    const amount = Math.round(dto.amount);
    if (!amount || amount <= 0) throw new BadRequestException('Сумма оплаты должна быть больше нуля');
    const total = Math.max(booking.totalPrice - booking.pointsRedeemed, 0) + booking.extrasTotal;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId, provider: `manual:${dto.method}`, status: PaymentStatus.PAID, amount,
        payerType: dto.payerType ?? null, payerName: dto.payerName ?? null,
        settlementKind: dto.settlementKind ?? null, vatRate: dto.vatRate ?? null, paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      },
    });
    const agg = await this.prisma.payment.aggregate({ where: { bookingId, status: PaymentStatus.PAID }, _sum: { amount: true } });
    const paid = agg._sum.amount ?? 0;
    if (paid >= total) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: PaymentStatus.PAID } });
      // Booking Engine (Путь B): полная оплата подтверждает бронь pending_payment → confirmed.
      await this.prisma.booking.updateMany({ where: { id: bookingId, status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED } });
    }
    // Чек прихода (если включена фискализация; иначе no-op). Сбой не влияет на регистрацию оплаты.
    await this.fiscalize(payment.id, amount, booking).catch(() => undefined);
    this.logger.log(`Ручная оплата брони ${bookingId}: ${amount} ₽ (${dto.method})`);
    return { paymentId: payment.id, paid, remaining: Math.max(0, total - paid) };
  }

  /** Создать ОДИН платёж на группу броней (мульти-номер), с общим чеком 54-ФЗ. */
  async createForGroup(guestId: string, groupId: string): Promise<CreatePaymentResult> {
    const bookings = await this.prisma.booking.findMany({
      where: { groupId, guestId },
      include: { property: true, guest: true },
    });
    if (bookings.length === 0) throw new NotFoundException('Группа броней не найдена');
    const unpaid = bookings.filter((b) => b.paymentStatus !== PaymentStatus.PAID);
    if (unpaid.length === 0) throw new ConflictException('Бронирования уже оплачены');

    const payableOf = (b: (typeof unpaid)[number]) =>
      Math.max(b.totalPrice - b.pointsRedeemed, 0) + b.extrasTotal;
    const amount = unpaid.reduce((s, b) => s + payableOf(b), 0);
    if (amount <= 0) throw new BadRequestException('Сумма к оплате равна нулю');

    const first = unpaid[0]!;
    const description = `Проживание · ${unpaid.length} номера · ${first.property.name}`;
    const receipt: Receipt = {
      customer: { email: first.guest.email ?? undefined, phone: first.guest.phone ?? undefined },
      items: unpaid.map((b) => ({
        description: `${b.property.name} (${b.checkIn.toISOString().slice(0, 10)})`.slice(0, 128),
        quantity: 1,
        amount: { value: payableOf(b).toFixed(2), currency: 'RUB' },
        vatCode: 1,
        paymentSubject: 'service',
        paymentMode: 'full_payment',
      })),
    };

    const result = await this.gateway.createPayment({
      amountRub: amount,
      currency: 'RUB',
      description,
      capture: true,
      bookingId: first.id,
      returnUrl: this.config.get('PAYMENT_RETURN_URL', { infer: true }),
      receipt,
      idempotenceKey: randomUUID(),
      allowedMethods: await this.allowedMethods(),
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId: first.id,
          groupId,
          provider: this.activeProvider(),
          gatewayPaymentId: result.gatewayPaymentId,
          status: PaymentStatus.PENDING,
          amount,
        },
      });
      await tx.booking.updateMany({ where: { groupId }, data: { paymentStatus: PaymentStatus.PENDING } });
      return created;
    });

    return {
      paymentId: payment.id,
      gatewayPaymentId: result.gatewayPaymentId,
      status: result.status,
      confirmationUrl: result.confirmationUrl,
      amount,
    };
  }

  /** Обработать webhook шлюза: обновить платёж и статус оплаты брони. */
  async handleWebhook(payload: unknown): Promise<void> {
    const event = this.gateway.parseWebhook(payload);
    const payment = await this.prisma.payment.findUnique({
      where: { gatewayPaymentId: event.gatewayPaymentId },
    });
    if (!payment) {
      this.logger.warn(`Webhook: платёж ${event.gatewayPaymentId} не найден`);
      return;
    }
    await this.applyStatus(payment.id, event.status);
  }

  /** Демо-оплата (только mock-шлюз — YooKassa или БСПБ): помечает платёж успешным. */
  async simulateSuccess(guestId: string, paymentId: string): Promise<void> {
    const gateway = this.gateway as { markSucceeded?: (id: string) => void };
    if (typeof gateway.markSucceeded !== 'function') {
      throw new ForbiddenException('Демо-оплата доступна только для mock-провайдера');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment || payment.booking.guestId !== guestId) {
      throw new NotFoundException('Платёж не найден');
    }
    if (payment.gatewayPaymentId) gateway.markSucceeded(payment.gatewayPaymentId);
    await this.applyStatus(payment.id, 'succeeded');
  }

  /**
   * Синхронизировать статус платежа со шлюзом (фолбэк к webhook).
   * Гость может вызвать вручную после возврата со страницы оплаты.
   */
  async syncStatus(guestId: string, paymentId: string): Promise<{ status: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment || payment.booking.guestId !== guestId) {
      throw new NotFoundException('Платёж не найден');
    }
    await this.syncOne(payment);
    const updated = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return { status: updated?.status ?? payment.status };
  }

  /**
   * Фоновый поллинг «висящих» платежей (PENDING/AUTHORIZED) — подстраховка на
   * случай недоставки webhook. Старше 24 ч не опрашиваем (брошенные оплаты).
   */
  async syncPendingPayments(): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pending = await this.prisma.payment.findMany({
      where: {
        status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] },
        gatewayPaymentId: { not: null },
        createdAt: { gte: since },
      },
    });
    let updated = 0;
    for (const p of pending) {
      try {
        const before = p.status;
        await this.syncOne(p);
        const after = await this.prisma.payment.findUnique({
          where: { id: p.id },
          select: { status: true },
        });
        if (after && after.status !== before) updated += 1;
      } catch (err) {
        this.logger.warn(`Поллинг платежа ${p.id}: ${(err as Error).message}`);
      }
    }
    return updated;
  }

  /** Запросить статус у шлюза и применить его к платежу/брони. */
  private async syncOne(payment: {
    id: string;
    gatewayPaymentId: string | null;
  }): Promise<void> {
    if (!payment.gatewayPaymentId) return;
    const { status } = await this.gateway.getPayment(payment.gatewayPaymentId);
    await this.applyStatus(payment.id, status);
  }

  /** Возврат средств по платежу. */
  async refund(guestId: string, paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true },
    });
    if (!payment || payment.booking.guestId !== guestId) {
      throw new NotFoundException('Платёж не найден');
    }
    if (!payment.gatewayPaymentId) throw new BadRequestException('Платёж не проведён');

    await this.gateway.createRefund(payment.gatewayPaymentId, payment.amount);
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED, refundedAmount: payment.amount },
      });
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      });
    });
  }

  /** Внутренний возврат при отмене брони: возвращает оплаченный платёж, если он есть. */
  async refundForBooking(bookingId: string): Promise<boolean> {
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: PaymentStatus.PAID },
    });
    if (!payment?.gatewayPaymentId) return false;

    await this.gateway.createRefund(payment.gatewayPaymentId, payment.amount);
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED, refundedAmount: payment.amount },
    });
    return true;
  }

  private async applyStatus(paymentId: string, gatewayStatus: string): Promise<void> {
    const mapped = mapGatewayStatus(gatewayStatus);
    if (!mapped) return;
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    // Идемпотентность: webhook/поллинг могут прийти повторно — не дублируем чек/уведомление.
    if (payment.status === mapped) return;

    const bookingStatus = this.bookingPaymentStatus(mapped);
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: mapped } });
      if (payment.groupId) {
        // Групповая оплата (мульти-номер): обновляем все брони группы.
        await tx.booking.updateMany({
          where: { groupId: payment.groupId },
          data: { paymentStatus: bookingStatus },
        });
      } else {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { paymentStatus: bookingStatus },
        });
      }
      // Booking Engine (Путь B): оплата подтверждает бронь pending_payment → confirmed.
      // Bnovo-брони создаются сразу CONFIRMED и этим фильтром не затрагиваются.
      if (mapped === PaymentStatus.PAID) {
        const scope = payment.groupId ? { groupId: payment.groupId } : { id: payment.bookingId };
        await tx.booking.updateMany({ where: { ...scope, status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED } });
      }
    });
    this.logger.log(`Платёж ${paymentId} → ${mapped}`);

    // Чек об оплате (§16.2) — один на платёж (на группу тоже один).
    if (mapped === PaymentStatus.PAID) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: payment.bookingId },
        include: { property: true, guest: true },
      });
      if (booking) {
        await this.notifications.notify(booking.guestId, 'PAYMENT_RECEIPT', {
          amount: payment.amount,
          property: booking.property.name,
        });
        // Фискализация чека 54-ФЗ. Нужна, когда эквайер не бьёт чек сам (БСПБ);
        // для ЮKassa обычно выключена (FISCAL_PROVIDER=none). Сбой не влияет на оплату.
        await this.fiscalize(payment.id, payment.amount, booking);
      }
    }
  }

  /** Пробить фискальный чек прихода через активный FiscalPort (если включён). */
  private async fiscalize(
    paymentId: string,
    amount: number,
    booking: { guest: { email: string | null; phone: string | null }; property: { name: string }; checkIn: Date; checkOut: Date },
  ): Promise<void> {
    if (!this.fiscal.enabled()) return;
    try {
      const description = `Проживание · ${booking.property.name} · ${booking.checkIn
        .toISOString()
        .slice(0, 10)}–${booking.checkOut.toISOString().slice(0, 10)}`;
      const receipt = buildReceipt({ description, amountRub: amount, email: booking.guest.email, phone: booking.guest.phone });
      const r = await this.fiscal.register({ paymentId, amountRub: amount, receipt });
      this.logger.log(
        `Фискализация платежа ${paymentId} (${r.provider}): ${r.status}` +
          (r.fiscalId ? ` · ФД ${r.fiscalId}` : '') +
          (r.error ? ` · ${r.error}` : ''),
      );
    } catch (e) {
      this.logger.error(`Фискализация платежа ${paymentId}: ${(e as Error).message}`);
    }
  }

  /** Статус оплаты брони по статусу платежа. */
  private bookingPaymentStatus(payment: PaymentStatus): PaymentStatus {
    if (payment === PaymentStatus.FAILED) return PaymentStatus.NOT_PAID;
    return payment;
  }
}
