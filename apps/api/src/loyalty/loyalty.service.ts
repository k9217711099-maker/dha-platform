import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BookingStatus, LoyaltyTier, PaymentStatus, PointStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  BookingChannel as DomainChannel,
  LoyaltyTier as DomainTier,
  TIER_QUALIFICATION_MONTHS,
  calcAccrualPoints,
  canRedeem,
  determineTier,
  maxRedeemablePoints,
  pointsExpiryDate,
  tierProgress,
  type TierProgress,
} from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface LoyaltySummary {
  tier: LoyaltyTier;
  availableBalance: number;
  pendingBalance: number;
  qualifyingAmountRub: number;
  qualifyingNights: number;
  progress: TierProgress;
  nearestExpiry: Date | null;
  history: { amount: number; status: PointStatus; reason: string; createdAt: Date }[];
}

/** Программа лояльности D H&A (§13). Источник истины по лояльности — backend. */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Баланс ---

  async getAvailableBalance(guestId: string): Promise<number> {
    return this.sumPoints(guestId, PointStatus.AVAILABLE);
  }

  /** Максимум баллов к списанию на бронь с учётом баланса и лимита уровня (для Booking Engine quote). */
  async maxRedeemable(guestId: string, totalBookingRub: number): Promise<{ availableBalance: number; maxPoints: number }> {
    const guest = await this.prisma.guest.findUniqueOrThrow({ where: { id: guestId }, select: { loyaltyTier: true } });
    const availableBalance = await this.getAvailableBalance(guestId);
    const maxPoints = maxRedeemablePoints({
      availablePoints: availableBalance,
      totalBookingRub,
      tier: guest.loyaltyTier as unknown as DomainTier,
    });
    return { availableBalance, maxPoints };
  }

  /** Предпросмотр начисления баллов за бронь (без записи) — для Booking Engine quote. */
  async previewAccrual(guestId: string, eligibleStayCostRub: number, channel: string): Promise<number> {
    const guest = await this.prisma.guest.findUniqueOrThrow({ where: { id: guestId }, select: { loyaltyTier: true } });
    return calcAccrualPoints({
      eligibleStayCostRub,
      tier: guest.loyaltyTier as unknown as DomainTier,
      channel: channel as DomainChannel,
    });
  }

  private async sumPoints(guestId: string, status: PointStatus): Promise<number> {
    const agg = await this.prisma.pointTransaction.aggregate({
      where: { guestId, status },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  // --- Начисление и списание (при бронировании) ---

  async reserveAccrual(
    tx: Tx,
    params: {
      guestId: string;
      bookingId: string;
      eligibleStayCostRub: number;
      tier: LoyaltyTier;
      channel: string;
    },
  ): Promise<number> {
    const points = calcAccrualPoints({
      eligibleStayCostRub: params.eligibleStayCostRub,
      tier: params.tier as unknown as DomainTier,
      channel: params.channel as DomainChannel,
    });
    if (points <= 0) return 0;
    await tx.pointTransaction.create({
      data: {
        guestId: params.guestId,
        bookingId: params.bookingId,
        amount: points,
        status: PointStatus.PENDING,
        reason: 'accrual',
        expiresAt: pointsExpiryDate(new Date()),
      },
    });
    return points;
  }

  async redeem(
    tx: Tx,
    params: {
      guestId: string;
      bookingId: string;
      points: number;
      totalBookingRub: number;
      tier: LoyaltyTier;
      availableBalance: number;
    },
  ): Promise<void> {
    const ok = canRedeem({
      pointsToRedeem: params.points,
      availablePoints: params.availableBalance,
      totalBookingRub: params.totalBookingRub,
      tier: params.tier as unknown as DomainTier,
    });
    if (!ok) throw new BadRequestException('Недопустимое количество баллов к списанию');
    await tx.pointTransaction.create({
      data: {
        guestId: params.guestId,
        bookingId: params.bookingId,
        amount: -params.points,
        status: PointStatus.SPENT,
        reason: 'redemption',
      },
    });
  }

  /** Продлить срок действия активных баллов при новом прямом бронировании (§13.6). */
  async extendActivePoints(guestId: string, fromDate: Date = new Date()): Promise<void> {
    await this.prisma.pointTransaction.updateMany({
      where: { guestId, status: { in: [PointStatus.PENDING, PointStatus.AVAILABLE] } },
      data: { expiresAt: pointsExpiryDate(fromDate) },
    });
  }

  // --- Жизненный цикл ---

  /**
   * Подтвердить проживание после выезда + оплаты (§13.7): баллы PENDING→AVAILABLE,
   * бронь CHECKED_OUT, пересчёт уровня.
   */
  async confirmStay(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.paymentStatus !== PaymentStatus.PAID) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.pointTransaction.updateMany({
        where: { bookingId, status: PointStatus.PENDING, reason: 'accrual' },
        data: { status: PointStatus.AVAILABLE },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CHECKED_OUT },
      });
    });
    await this.recalcTier(booking.guestId);

    // Уведомление о начислении баллов (§16.1)
    const agg = await this.prisma.pointTransaction.aggregate({
      where: { bookingId, reason: 'accrual', status: PointStatus.AVAILABLE },
      _sum: { amount: true },
    });
    const points = agg._sum.amount ?? 0;
    if (points > 0) {
      await this.notifications.notify(booking.guestId, 'POINTS_ACCRUED', { points });
    }
  }

  /** Перевести просроченные доступные баллы в EXPIRED (§13.6). Возвращает число операций. */
  async expirePoints(now: Date = new Date()): Promise<number> {
    const res = await this.prisma.pointTransaction.updateMany({
      where: { status: PointStatus.AVAILABLE, expiresAt: { lt: now } },
      data: { status: PointStatus.EXPIRED },
    });
    return res.count;
  }

  /** Завершить проживания, по которым выезд прошёл и оплата получена. */
  async settleCompletedStays(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: {
        checkOut: { lt: now },
        paymentStatus: PaymentStatus.PAID,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      },
      select: { id: true },
    });
    for (const b of due) await this.confirmStay(b.id);
    return due.length;
  }

  // --- Уровни ---

  /** Квалифицирующие показатели за 12 мес: оплаченные прямые брони (§13.4). */
  async computeQualifying(guestId: string): Promise<{ amountRub: number; nights: number }> {
    const since = new Date();
    since.setMonth(since.getMonth() - TIER_QUALIFICATION_MONTHS);
    const agg = await this.prisma.booking.aggregate({
      where: {
        guestId,
        paymentStatus: PaymentStatus.PAID,
        channel: { not: 'OTA' },
        status: { not: BookingStatus.CANCELLED },
        checkIn: { gte: since },
      },
      _sum: { totalPrice: true, nights: true },
    });
    return { amountRub: agg._sum.totalPrice ?? 0, nights: agg._sum.nights ?? 0 };
  }

  /** Пересчитать и сохранить уровень гостя. */
  async recalcTier(guestId: string): Promise<LoyaltyTier> {
    const { amountRub, nights } = await this.computeQualifying(guestId);
    const tier = determineTier(amountRub, nights) as unknown as LoyaltyTier;
    await this.prisma.guest.update({ where: { id: guestId }, data: { loyaltyTier: tier } });
    return tier;
  }

  // --- Сводка для гостя ---

  async getSummary(guestId: string): Promise<LoyaltySummary> {
    const guest = await this.prisma.guest.findUniqueOrThrow({ where: { id: guestId } });
    const [available, pending, qualifying, history, nearest] = await Promise.all([
      this.getAvailableBalance(guestId),
      this.sumPoints(guestId, PointStatus.PENDING),
      this.computeQualifying(guestId),
      this.prisma.pointTransaction.findMany({
        where: { guestId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { amount: true, status: true, reason: true, createdAt: true },
      }),
      this.prisma.pointTransaction.findFirst({
        where: { guestId, status: PointStatus.AVAILABLE, expiresAt: { not: null } },
        orderBy: { expiresAt: 'asc' },
        select: { expiresAt: true },
      }),
    ]);

    return {
      tier: guest.loyaltyTier,
      availableBalance: available,
      pendingBalance: pending,
      qualifyingAmountRub: qualifying.amountRub,
      qualifyingNights: qualifying.nights,
      progress: tierProgress(qualifying.amountRub, qualifying.nights),
      nearestExpiry: nearest?.expiresAt ?? null,
      history,
    };
  }

  // --- Ручные операции (используются админ-панелью, блок 12) ---

  async manualAccrue(guestId: string, amount: number, comment: string): Promise<void> {
    await this.prisma.pointTransaction.create({
      data: {
        guestId,
        amount: Math.abs(amount),
        status: PointStatus.AVAILABLE,
        reason: `manual:${comment}`,
        expiresAt: pointsExpiryDate(new Date()),
      },
    });
  }

  async manualDeduct(guestId: string, amount: number, comment: string): Promise<void> {
    await this.prisma.pointTransaction.create({
      data: {
        guestId,
        amount: -Math.abs(amount),
        status: PointStatus.SPENT,
        reason: `manual:${comment}`,
      },
    });
  }

  async adjustTier(guestId: string, tier: LoyaltyTier): Promise<void> {
    await this.prisma.guest.update({ where: { id: guestId }, data: { loyaltyTier: tier } });
  }
}
