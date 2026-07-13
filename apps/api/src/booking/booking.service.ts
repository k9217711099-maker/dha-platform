import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingChannel, BookingStatus, PaymentStatus, PointStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { BnovoPort } from '../integrations/bnovo/bnovo.port.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { CrmService } from '../crm/crm.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PromocodeService } from '../promocodes/promocode.service.js';
import { ExtrasService } from '../extras/extras.service.js';
import { randomUUID } from 'node:crypto';
import { toBookingView, type BookingView } from './booking.view.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
import type { CreateBookingGroupDto } from './dto/create-booking-group.dto.js';

const INCLUDE = { property: true, roomType: true, extras: true } as const;

/** Создание и просмотр бронирований (§6.5, §7). */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bnovo: BnovoPort,
    private readonly loyalty: LoyaltyService,
    private readonly payments: PaymentsService,
    private readonly crm: CrmService,
    private readonly notifications: NotificationsService,
    private readonly promocodes: PromocodeService,
    private readonly extras: ExtrasService,
  ) {}

  /**
   * Создать бронь (§6.5): перепроверить цену/доступность в Bnovo → создать бронь в
   * Bnovo → сохранить у нас → зарезервировать/списать баллы → отправить подтверждение.
   */
  async create(guestId: string, dto: CreateBookingDto): Promise<BookingView> {
    const roomType = await this.prisma.roomType.findUnique({
      where: { id: dto.roomTypeId },
      include: { property: true },
    });
    if (!roomType || !roomType.active) throw new NotFoundException('Категория номера не найдена');

    // 1. Актуальная доступность/цена из Bnovo (источник истины)
    const offers = await this.bnovo.getAvailability({
      propertyId: roomType.property.bnovoId ?? undefined,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guests: dto.guests,
    });
    const roomsCount = dto.roomsCount ?? 1;
    const offer = offers.find((o) => o.roomTypeId === roomType.bnovoId);
    if (!offer || offer.available < roomsCount) {
      throw new ConflictException(
        roomsCount > 1 ? `Нет ${roomsCount} свободных номеров на даты` : 'На выбранные даты нет доступности',
      );
    }
    const ratePlan = offer.ratePlans.find((r) => r.id === dto.ratePlanId);
    if (!ratePlan) throw new ConflictException('Выбранный тариф больше недоступен');

    const guest = await this.prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) throw new NotFoundException('Гость не найден');

    // Промокод (§17): скидка на стоимость проживания (× число номеров)
    const discount = await this.promocodes.applyToBase(dto.promoCode, ratePlan.totalPrice * roomsCount);
    const totalPrice = discount.finalRub;

    // 2. Создание брони(ей) в Bnovo — по одной на каждый номер.
    // TODO(прод): при сбое БД после этого шага нужна компенсация (отмена в Bnovo);
    //   для мульти-номера хранится первый bnovoBookingId (mock этого достаточно).
    const guestData = {
      firstName: dto.firstName ?? guest.firstName ?? undefined,
      lastName: dto.lastName ?? guest.lastName ?? undefined,
      phone: dto.phone ?? guest.phone ?? undefined,
      email: dto.email ?? guest.email ?? undefined,
    };
    const bnovoIds: string[] = [];
    for (let k = 0; k < roomsCount; k += 1) {
      const r = await this.bnovo.createBooking({
        propertyId: roomType.property.bnovoId ?? '',
        roomTypeId: roomType.bnovoId ?? '',
        ratePlanId: ratePlan.id,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        guests: dto.guests,
        guest: guestData,
      });
      bnovoIds.push(r.bnovoBookingId);
    }
    const bnovoResult = { bnovoBookingId: bnovoIds[0]! };

    const availableBalance = await this.loyalty.getAvailableBalance(guestId);
    const channel = (dto.channel as BookingChannel) ?? BookingChannel.WEBSITE;

    // 3. Сохранение + баллы атомарно
    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          tenantId: guest.tenantId,
          guestId,
          propertyId: roomType.propertyId,
          roomTypeId: roomType.id,
          bnovoBookingId: bnovoResult.bnovoBookingId,
          groupId: dto.groupId ?? null,
          status: BookingStatus.CONFIRMED,
          channel,
          checkIn: new Date(dto.checkIn),
          checkOut: new Date(dto.checkOut),
          nights: offer.nights,
          guests: dto.guests,
          roomsCount,
          ratePlanId: ratePlan.id,
          ratePlanName: ratePlan.name,
          refundable: ratePlan.refundable,
          cancellationPolicy: ratePlan.cancellationPolicy,
          totalPrice,
          promoCode: dto.promoCode ?? null,
          comment: dto.comment ?? null,
        },
      });

      let pointsRedeemed = 0;
      if (dto.pointsToRedeem && dto.pointsToRedeem > 0) {
        await this.loyalty.redeem(tx, {
          guestId,
          bookingId: created.id,
          points: dto.pointsToRedeem,
          totalBookingRub: totalPrice,
          tier: guest.loyaltyTier,
          availableBalance,
        });
        pointsRedeemed = dto.pointsToRedeem;
      }

      const pointsReserved = await this.loyalty.reserveAccrual(tx, {
        guestId,
        bookingId: created.id,
        eligibleStayCostRub: totalPrice,
        tier: guest.loyaltyTier,
        channel,
      });

      return tx.booking.update({
        where: { id: created.id },
        data: { pointsReserved, pointsRedeemed },
        include: INCLUDE,
      });
    });

    if (discount.promocode) await this.promocodes.markUsed(discount.promocode.id);

    // Продлеваем срок действия активных баллов при новом прямом бронировании (§13.6)
    if (channel !== BookingChannel.OTA) {
      await this.loyalty.extendActivePoints(guestId);
    }

    // Контакт + сделка в Bitrix24 (не блокирует бронь при сбое CRM)
    await this.crm.syncBooking(booking.id);

    // 4. Подтверждение гостю (push + email, §16)
    await this.notifications.notify(guestId, 'BOOKING_CONFIRMED', {
      property: booking.property.name,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
    });

    return toBookingView(booking);
  }

  /**
   * Групповое бронирование (мульти-номер): создаёт несколько броней с общим groupId.
   * Списание баллов поддерживается только для одной позиции (иначе пропускается).
   */
  async createGroup(
    guestId: string,
    dto: CreateBookingGroupDto,
  ): Promise<{ groupId: string; bookings: BookingView[]; totalPayable: number }> {
    const groupId = randomUUID();
    const allowPoints = dto.items.length === 1;
    const bookings: BookingView[] = [];
    for (let i = 0; i < dto.items.length; i += 1) {
      const item = dto.items[i]!;
      const view = await this.create(guestId, {
        roomTypeId: item.roomTypeId,
        ratePlanId: item.ratePlanId,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        guests: item.guests,
        roomsCount: item.roomsCount ?? 1,
        promoCode: dto.promoCode,
        comment: dto.comment,
        channel: dto.channel,
        pointsToRedeem: allowPoints ? dto.pointsToRedeem : undefined,
        groupId,
      });
      // Доп-услуги (апселлы) — считаются у нас, не зависят от Bnovo (§лояльность: не входят в базу баллов)
      if (item.extras?.length) {
        await this.extras.attachToBooking(view.id, item.extras, view.nights, item.guests);
      }
      bookings.push(await this.getOne(guestId, view.id));
    }
    const totalPayable = bookings.reduce((s, b) => s + b.payableAmount, 0);
    return { groupId, bookings, totalPayable };
  }

  async list(guestId: string): Promise<BookingView[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { guestId },
      include: INCLUDE,
      orderBy: { checkIn: 'desc' },
    });
    return bookings.map((b) => toBookingView(b));
  }

  async getOne(guestId: string, id: string): Promise<BookingView> {
    const booking = await this.prisma.booking.findFirst({
      where: { id, guestId },
      include: INCLUDE,
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    return toBookingView(booking);
  }

  /**
   * Отменить бронь (§7.2): только возвратный тариф и до заезда. Отменяет в Bnovo,
   * возвращает оплату (если была), снимает резерв баллов.
   */
  async cancel(guestId: string, id: string, reason?: string): Promise<BookingView> {
    const booking = await this.prisma.booking.findFirst({
      where: { id, guestId },
      include: INCLUDE,
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException('Бронирование уже отменено');
    }
    if (!booking.refundable) {
      throw new BadRequestException('Невозвратный тариф — отмена недоступна');
    }
    if (booking.checkIn <= new Date()) {
      throw new BadRequestException('Нельзя отменить начавшееся или прошедшее проживание');
    }

    if (booking.bnovoBookingId) {
      await this.bnovo.cancelBooking(booking.bnovoBookingId);
    }
    if (booking.paymentStatus === PaymentStatus.PAID) {
      await this.payments.refundForBooking(booking.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Снимаем резерв начисления (§13.7: при отмене баллы не начисляются)
      await tx.pointTransaction.updateMany({
        where: { bookingId: booking.id, status: PointStatus.PENDING },
        data: { status: PointStatus.CANCELLED },
      });
      return tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelReason: reason ?? 'Отменено гостем',
          paymentStatus:
            booking.paymentStatus === PaymentStatus.PAID
              ? PaymentStatus.REFUNDED
              : booking.paymentStatus,
        },
        include: INCLUDE,
      });
    });

    return toBookingView(updated);
  }
}
