import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyStatus, PaymentStatus } from '@prisma/client';
import {
  BookingStatus as DomainBookingStatus,
  CheckinStatus as DomainCheckinStatus,
  computeFunnelStage,
  computeKeyValidityWindow,
  type FunnelGate,
  type FunnelStage,
} from '@dha/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { combineDateAndTime } from '../../keys/key-window.js';
import type { Env } from '../../config/env.schema.js';

/** Панель «Заселение» в карточке брони (CHECK-IN-TZ §11, спринт 1 — read-only). */
export interface FunnelPanelView {
  bookingId: string;
  stage: FunnelStage;
  gates: FunnelGate[];
  /** Окно действия ключа (когда гость сможет открыть дверь). */
  window: { start: Date; end: Date };
  /** Сырые факты для деталей в UI. */
  checkinStatus: string;
  paymentStatus: PaymentStatus;
  roomAssigned: boolean;
  roomName: string | null;
  /** Есть ли у гостя контакт для воронки (телефон/email). */
  hasContact: boolean;
  /** Выданные ключи (все статусы, для журнала). */
  keys: { doorName: string | null; status: KeyStatus; validFrom: Date; validUntil: Date }[];
}

/**
 * Ось воронки заселения (CHECK-IN-TZ §1): вычисление стадии из существующих
 * шлюзов (Checkin, PaymentStatus, roomId, DigitalKey, окно ключа) + обновление
 * денормализованного кэша Booking.funnelStage. Ось шахматки (BookingStatus)
 * не трогает — читает её как факт.
 */
@Injectable()
export class CheckinFunnelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Панель «Заселение» по брони + ленивое обновление кэша funnelStage. */
  async panelForBooking(tenantId: string, bookingId: string): Promise<FunnelPanelView> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: {
        guest: { select: { phone: true, email: true } },
        checkin: { select: { status: true } },
        property: { select: { checkInTime: true, checkOutTime: true } },
        room: { select: { number: true } },
        digitalKeys: {
          select: { doorName: true, status: true, validFrom: true, validUntil: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');

    const window = computeKeyValidityWindow({
      checkinAt: combineDateAndTime(booking.checkIn, booking.property.checkInTime, '14:00'),
      checkoutAt: combineDateAndTime(booking.checkOut, booking.property.checkOutTime, '12:00'),
      preCheckinMinutes: this.config.get('KEY_PRE_CHECKIN_MINUTES', { infer: true }),
      postCheckoutMinutes: this.config.get('KEY_POST_CHECKOUT_MINUTES', { infer: true }),
    });

    // Контакт для воронки: телефон/email гостя (верификация — этап 4, magic-link).
    const hasContact = Boolean(booking.guest?.phone || booking.guest?.email);
    const { stage, gates } = computeFunnelStage({
      bookingStatus: booking.status as unknown as DomainBookingStatus,
      checkinStatus: (booking.checkin?.status ?? 'NOT_STARTED') as unknown as DomainCheckinStatus,
      hasVerifiedContact: hasContact,
      // Как в KeysService.decide: оплата удовлетворена только при PAID; требуется всегда.
      paymentSatisfied: booking.paymentStatus === PaymentStatus.PAID,
      paymentRequired: true,
      roomAssigned: booking.roomId !== null,
      hasActiveKey: booking.digitalKeys.some((k) => k.status === KeyStatus.ACTIVE),
      now: new Date(),
      window,
    });

    // Ленивое обновление кэша (не блокируем ответ при гонке).
    if (booking.funnelStage !== stage) {
      await this.prisma.booking
        .update({ where: { id: bookingId }, data: { funnelStage: stage } })
        .catch(() => undefined);
    }

    return {
      bookingId,
      stage,
      gates,
      window,
      checkinStatus: booking.checkin?.status ?? 'NOT_STARTED',
      paymentStatus: booking.paymentStatus,
      roomAssigned: booking.roomId !== null,
      roomName: booking.room?.number ?? null,
      hasContact,
      keys: booking.digitalKeys,
    };
  }
}
