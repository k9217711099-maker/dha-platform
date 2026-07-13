import { Injectable } from '@nestjs/common';
import { BookingChannel, ChatDirection, PaymentStatus, PointStatus, Prisma } from '@prisma/client';
import { computeDerivedKpis } from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';

export interface AnalyticsMetrics {
  installs: number;
  registrations: number;
  bookings: number;
  directBookings: number;
  paidBookings: number;
  directShare: number;
  averageCheckRub: number;
  conversionRate: number;
  repeatRate: number;
  pointsAccrued: number;
  pointsSpent: number;
  keyErrors: number;
  chatResponseAvgMinutes: number;
  /** Метрики v2 (заявки/апселлы/отзывы) — заполняются в соответствующих блоках. */
  requests: number;
  upsells: number;
  reviews: number;
}

/** Аналитика гостевой платформы (§19). */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Записать событие (установка/открытие/шаг воронки). */
  async track(input: {
    type: string;
    guestId?: string;
    anonymousId?: string;
    props?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: {
        type: input.type,
        guestId: input.guestId,
        anonymousId: input.anonymousId,
        props: (input.props ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Сводные показатели для админ-дашборда. */
  async metrics(): Promise<AnalyticsMetrics> {
    const [
      installs,
      registrations,
      bookings,
      directBookings,
      paid,
      byGuest,
      pointsAccruedAgg,
      pointsSpentAgg,
      keyErrors,
      chatMessages,
    ] = await Promise.all([
      this.prisma.analyticsEvent.count({ where: { type: 'install' } }),
      this.prisma.guest.count(),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { channel: { not: BookingChannel.OTA } } }),
      this.prisma.booking.aggregate({
        where: { paymentStatus: PaymentStatus.PAID },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.booking.groupBy({ by: ['guestId'], _count: { _all: true } }),
      this.prisma.pointTransaction.aggregate({
        where: { status: PointStatus.AVAILABLE, reason: 'accrual' },
        _sum: { amount: true },
      }),
      this.prisma.pointTransaction.aggregate({
        where: { status: PointStatus.SPENT },
        _sum: { amount: true },
      }),
      this.prisma.digitalKeyLog.count({ where: { event: 'error' } }),
      this.prisma.chatMessage.findMany({
        orderBy: { createdAt: 'asc' },
        select: { guestId: true, direction: true, createdAt: true },
      }),
    ]);

    const guestsWithBooking = byGuest.length;
    const guestsWithRepeat = byGuest.filter((g) => g._count._all >= 2).length;

    const derived = computeDerivedKpis({
      bookings,
      directBookings,
      paidCount: paid._count._all,
      paidSumRub: paid._sum.totalPrice ?? 0,
      registrations,
      guestsWithBooking,
      guestsWithRepeat,
    });

    return {
      installs,
      registrations,
      bookings,
      directBookings,
      paidBookings: paid._count._all,
      ...derived,
      pointsAccrued: pointsAccruedAgg._sum.amount ?? 0,
      pointsSpent: Math.abs(pointsSpentAgg._sum.amount ?? 0),
      keyErrors,
      chatResponseAvgMinutes: this.avgChatResponseMinutes(chatMessages),
      requests: 0,
      upsells: 0,
      reviews: 0,
    };
  }

  /** Среднее время ответа ресепшен: от сообщения гостя до ближайшего ответа сотрудника. */
  private avgChatResponseMinutes(
    messages: { guestId: string; direction: ChatDirection; createdAt: Date }[],
  ): number {
    const pendingByGuest = new Map<string, Date>();
    const diffs: number[] = [];
    for (const m of messages) {
      if (m.direction === ChatDirection.GUEST) {
        if (!pendingByGuest.has(m.guestId)) pendingByGuest.set(m.guestId, m.createdAt);
      } else {
        const start = pendingByGuest.get(m.guestId);
        if (start) {
          diffs.push((m.createdAt.getTime() - start.getTime()) / 60_000);
          pendingByGuest.delete(m.guestId);
        }
      }
    }
    if (diffs.length === 0) return 0;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }
}
