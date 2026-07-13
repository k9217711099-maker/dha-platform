import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingChannel, BookingStatus, PaymentStatus, PointStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AvailabilityService } from '../pms/availability/availability.service.js';
import { RateService } from '../pms/rates/rate.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { IdempotencyService } from '../pms/bookings/idempotency.service.js';
import { generateBookingNumber } from '../pms/bookings/booking.util.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { PromocodeService } from '../promocodes/promocode.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import type { CreateEngineBookingDto, QuoteEngineDto, SearchEngineDto } from './dto/booking-engine.dto.js';

const ENDPOINT = 'POST /v1/booking-engine/bookings';

const ENGINE_INCLUDE = {
  property: { select: { id: true, name: true } },
  roomType: { select: { id: true, name: true } },
  room: { select: { id: true, number: true } },
  guest: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
} satisfies Prisma.BookingInclude;

/**
 * Booking Engine (Путь B, DHP §20) — гостевой движок бронирования на СОБСТВЕННОМ PMS.
 * Флоу: search (наша доступность + наши тарифы) → quote (цена+промокод+лояльность) →
 * create (анти-овербукинг в PG-транзакции + бронь pending_payment + резерв/списание баллов
 * + payment intent). Оплата подтверждает бронь (PaymentsService: PENDING→CONFIRMED).
 * Не обращается к Bnovo. Овербукинг невозможен: PENDING-бронь занимает инвентарь; неоплаченные
 * авто-истекают (scheduler) — аналог TTL инвентарного лока.
 */
@Injectable()
export class BookingEngineService {
  private readonly logger = new Logger(BookingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly rates: RateService,
    private readonly loyalty: LoyaltyService,
    private readonly promocodes: PromocodeService,
    private readonly payments: PaymentsService,
    private readonly tenant: TenantService,
    private readonly idem: IdempotencyService,
    private readonly audit: AuditService,
  ) {}

  // ─── Поиск (публичный): доступность + предложения по тарифам ───
  async search(dto: SearchEngineDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const roomTypes = await this.availability.search(tenantId, {
      propertyId: dto.propertyId,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guests: dto.guests,
      children: dto.children,
    });
    const available = roomTypes.filter((rt) => rt.available > 0);
    if (available.length === 0) return [];

    const propertyIds = [...new Set(available.map((rt) => rt.propertyId))];
    const plansByProperty = new Map<string, Awaited<ReturnType<RateService['listPlans']>>>();
    for (const pid of propertyIds) {
      const plans = await this.rates.listPlans(tenantId, pid);
      plansByProperty.set(pid, plans.filter((p) => p.active));
    }

    const results = [];
    for (const rt of available) {
      const plans = plansByProperty.get(rt.propertyId) ?? [];
      const offers = [];
      for (const plan of plans) {
        try {
          const q = await this.rates.quote(tenantId, {
            propertyId: rt.propertyId,
            roomTypeId: rt.roomTypeId,
            ratePlanId: plan.id,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            guests: dto.guests,
          });
          offers.push({
            ratePlanId: plan.id,
            ratePlanName: plan.name,
            kind: plan.kind,
            refundable: plan.refundable,
            totalAmount: q.totalAmount,
            avgNightly: Math.round(q.totalAmount / q.nightsCount),
          });
        } catch {
          // Нет цены / сработало ограничение — этот тариф на выбранные даты не предлагаем.
        }
      }
      if (offers.length > 0) {
        offers.sort((a, b) => a.totalAmount - b.totalAmount);
        results.push({
          roomTypeId: rt.roomTypeId,
          roomTypeName: rt.roomTypeName,
          propertyId: rt.propertyId,
          propertyName: rt.propertyName,
          capacity: rt.capacity,
          available: rt.available,
          nights: rt.nights,
          offers,
        });
      }
    }
    return results;
  }

  // ─── Расчёт (guest): цена + промокод + лояльность, без побочных эффектов ───
  async quote(guestId: string, dto: QuoteEngineDto) {
    const guest = await this.prisma.guest.findUnique({ where: { id: guestId }, select: { tenantId: true } });
    if (!guest) throw new NotFoundException('Гость не найден');

    const rateQuote = await this.rates.quote(guest.tenantId, {
      propertyId: dto.propertyId,
      roomTypeId: dto.roomTypeId,
      ratePlanId: dto.ratePlanId,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guests: dto.guests,
    });
    const discount = await this.promocodes.applyToBase(dto.promoCode, rateQuote.totalAmount);
    const totalPrice = discount.finalRub;

    const { availableBalance, maxPoints } = await this.loyalty.maxRedeemable(guestId, totalPrice);
    const requestedRedeem = Math.min(dto.pointsToRedeem ?? 0, maxPoints);
    const redeemDiscount = requestedRedeem; // 1 балл = 1 ₽
    const channel = dto.source ?? BookingChannel.WEBSITE;
    const accrualPreview = await this.loyalty.previewAccrual(guestId, totalPrice, channel);

    return {
      rate: rateQuote,
      stayAmount: rateQuote.totalAmount,
      promo: { code: discount.promocode?.code ?? null, discountRub: discount.discountRub, applied: Boolean(discount.promocode) },
      loyalty: { availableBalance, maxRedeemablePoints: maxPoints, requestedRedeem, redeemDiscountRub: redeemDiscount, accrualPreview },
      totalPrice,
      payableAmount: Math.max(totalPrice - redeemDiscount, 0),
      currency: 'RUB',
    };
  }

  // ─── Создание брони (guest, идемпотентно) ───
  async createBooking(guestId: string, dto: CreateEngineBookingDto, idempotencyKey: string) {
    if (!idempotencyKey) throw new BadRequestException('Требуется заголовок Idempotency-Key');
    const guest = await this.prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) throw new NotFoundException('Гость не найден');
    const tenantId = guest.tenantId;
    // Ключ идемпотентности скоупим по гостю: ключи разных гостей не должны пересекаться.
    const scopedKey = `${guestId}:${idempotencyKey}`;

    const existing = await this.idem.lookup(tenantId, ENDPOINT, scopedKey);
    if (existing?.response) return existing.response; // повтор → исходный результат

    // Цена пересчитывается перед созданием (DHP §16): тариф + промокод.
    const rateQuote = await this.rates.quote(tenantId, {
      propertyId: dto.propertyId,
      roomTypeId: dto.roomTypeId,
      ratePlanId: dto.ratePlanId,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guests: dto.guests,
    });
    const discount = await this.promocodes.applyToBase(dto.promoCode, rateQuote.totalAmount);
    const totalPrice = discount.finalRub;
    const availableBalance = await this.loyalty.getAvailableBalance(guestId);
    const channel = dto.source ?? BookingChannel.WEBSITE;

    let preView;
    try {
      preView = await this.prisma.$transaction(async (tx) => {
        // Анти-овербукинг в этой же транзакции (PENDING-бронь занимает инвентарь).
        await this.availability.assertAndLockForBooking(tx, {
          tenantId,
          propertyId: dto.propertyId,
          roomTypeId: dto.roomTypeId,
          checkIn: dto.checkIn,
          checkOut: dto.checkOut,
          roomsCount: 1,
        });
        const booking = await tx.booking.create({
          data: {
            tenantId,
            bookingNumber: generateBookingNumber(),
            guestId,
            propertyId: dto.propertyId,
            roomTypeId: dto.roomTypeId,
            status: BookingStatus.PENDING, // pending_payment
            paymentStatus: PaymentStatus.NOT_PAID,
            channel,
            checkIn: new Date(dto.checkIn),
            checkOut: new Date(dto.checkOut),
            nights: rateQuote.nightsCount,
            guests: dto.guests,
            ratePlanId: rateQuote.ratePlanId,
            ratePlanName: rateQuote.ratePlanName,
            refundable: rateQuote.refundable,
            totalPrice,
            priceBreakdown: rateQuote as unknown as Prisma.InputJsonValue,
            promoCode: dto.promoCode ?? null,
            comment: dto.comment ?? null,
          },
        });
        await tx.bookingGuest.create({ data: { bookingId: booking.id, guestId, role: 'main', isPrimary: true } });

        let pointsRedeemed = 0;
        if (dto.pointsToRedeem && dto.pointsToRedeem > 0) {
          await this.loyalty.redeem(tx, {
            guestId,
            bookingId: booking.id,
            points: dto.pointsToRedeem,
            totalBookingRub: totalPrice,
            tier: guest.loyaltyTier,
            availableBalance,
          });
          pointsRedeemed = dto.pointsToRedeem;
        }
        const pointsReserved = await this.loyalty.reserveAccrual(tx, {
          guestId,
          bookingId: booking.id,
          eligibleStayCostRub: totalPrice,
          tier: guest.loyaltyTier,
          channel,
        });
        await tx.booking.update({ where: { id: booking.id }, data: { pointsReserved, pointsRedeemed } });

        const v = await this.viewOf(tx, booking.id);
        await tx.idempotencyKey.create({
          data: { tenantId, endpoint: ENDPOINT, key: scopedKey, bookingId: booking.id, response: JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue },
        });
        return v;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.idem.lookup(tenantId, ENDPOINT, scopedKey);
        if (again?.response) return again.response;
      }
      throw e;
    }

    if (discount.promocode) await this.promocodes.markUsed(discount.promocode.id);
    if (channel !== BookingChannel.OTA) await this.loyalty.extendActivePoints(guestId);
    await this.audit.record({ tenantId, actorId: guestId, action: 'created', entity: 'Booking', entityId: preView.id, payload: { bookingNumber: preView.bookingNumber, source: 'booking_engine', totalPrice } });

    // Payment intent (вне транзакции — вызов шлюза). Сбой не отменяет бронь — гость оплатит через /pay.
    let payment = null;
    try {
      payment = await this.payments.createForBooking(guestId, preView.id);
    } catch (err) {
      this.logger.warn(`Не удалось создать платёж для брони ${preView.id}: ${(err as Error).message}`);
    }

    const finalView = await this.viewOf(this.prisma, preView.id);
    const result = { booking: finalView, payment };
    await this.prisma.idempotencyKey.updateMany({
      where: { tenantId, endpoint: ENDPOINT, key: scopedKey },
      data: { response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue },
    });
    return result;
  }

  /** Повторно создать платёж по неоплаченной брони (брошенная корзина). */
  async pay(guestId: string, bookingId: string) {
    return this.payments.createForBooking(guestId, bookingId);
  }

  /**
   * Авто-истечение неоплаченных броней (аналог TTL инвентарного лока): PENDING без оплаты
   * старше ttlMinutes → CANCELLED, резерв баллов снимается, инвентарь освобождается.
   */
  async expireUnpaidBookings(ttlMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMinutes * 60_000);
    const stale = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, paymentStatus: { in: [PaymentStatus.NOT_PAID, PaymentStatus.PENDING] }, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const b of stale) {
      await this.prisma.$transaction(async (tx) => {
        await tx.pointTransaction.updateMany({ where: { bookingId: b.id, status: PointStatus.PENDING }, data: { status: PointStatus.CANCELLED } });
        await tx.booking.update({ where: { id: b.id }, data: { status: BookingStatus.CANCELLED, cancelReason: 'Оплата не поступила вовремя' } });
      });
    }
    if (stale.length > 0) this.logger.log(`Неоплаченных броней истекло: ${stale.length}`);
    return stale.length;
  }

  private viewOf(db: PrismaService | Prisma.TransactionClient, id: string) {
    return db.booking.findUniqueOrThrow({ where: { id }, include: ENGINE_INCLUDE });
  }
}
