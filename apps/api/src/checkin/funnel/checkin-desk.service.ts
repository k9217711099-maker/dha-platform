import { Injectable } from '@nestjs/common';
import { BookingStatus, KeyStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CheckinFunnelService } from './checkin-funnel.service.js';

/** Строка очереди заезда (CHECK-IN-TZ §11, «сегодня заезжают»). */
export interface ArrivalQueueItem {
  bookingId: string;
  bookingNumber: string | null;
  guestName: string | null;
  guestPhone: string | null;
  propertyId: string;
  propertyName: string;
  roomNumber: string | null;
  arrivalTime: string | null;
  status: BookingStatus;
  stage: string;
  /** Красные шлюзы (короткая индикация; полная панель — по клику). */
  badGates: { key: string; reason: string | null }[];
  checkinStatus: string;
  paymentStatus: string;
  hasActiveKey: boolean;
  hasLink: boolean;
}

/**
 * Очередь заезда для стойки + отчёт по воронке (CHECK-IN-TZ §11, спринт 6).
 * Право checkin_desk. Стадия/шлюзы — через panelForBooking (заодно освежает кэш).
 */
@Injectable()
export class CheckinDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funnel: CheckinFunnelService,
  ) {}

  /** Заезды на дату (UTC-день; по умолчанию сегодня), кроме отменённых. */
  async queue(tenantId: string, dateISO?: string, propertyId?: string): Promise<ArrivalQueueItem[]> {
    const day = (dateISO ?? new Date().toISOString()).slice(0, 10);
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 24 * 3_600_000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        tenantId,
        propertyId,
        checkIn: { gte: from, lt: to },
        status: { not: BookingStatus.CANCELLED },
      },
      include: {
        guest: { select: { firstName: true, lastName: true, phone: true } },
        checkin: { select: { status: true } },
        property: { select: { name: true } },
        room: { select: { number: true } },
        digitalKeys: { select: { status: true } },
        checkinLink: { select: { revokedAt: true, expiresAt: true } },
      },
      orderBy: [{ property: { name: 'asc' } }, { arrivalTime: 'asc' }],
    });

    return Promise.all(
      bookings.map(async (b) => {
        const panel = await this.funnel.panelForBooking(tenantId, b.id);
        const linkAlive =
          b.checkinLink && !b.checkinLink.revokedAt && (!b.checkinLink.expiresAt || b.checkinLink.expiresAt > new Date());
        return {
          bookingId: b.id,
          bookingNumber: b.bookingNumber,
          guestName: [b.guest?.firstName, b.guest?.lastName].filter(Boolean).join(' ') || null,
          guestPhone: b.guest?.phone ?? null,
          propertyId: b.propertyId,
          propertyName: b.property.name,
          roomNumber: b.room?.number ?? null,
          arrivalTime: b.arrivalTime,
          status: b.status,
          stage: panel.stage,
          badGates: panel.gates.filter((g) => !g.ok).map((g) => ({ key: g.key, reason: g.reason })),
          checkinStatus: b.checkin?.status ?? 'NOT_STARTED',
          paymentStatus: b.paymentStatus,
          hasActiveKey: b.digitalKeys.some((k) => k.status === KeyStatus.ACTIVE),
          hasLink: Boolean(linkAlive),
        };
      }),
    );
  }

  /** Отчёт по воронке за период (по дате заезда) + события оркестратора. */
  async report(tenantId: string, fromISO: string, toISO: string) {
    const from = new Date(`${fromISO.slice(0, 10)}T00:00:00.000Z`);
    const to = new Date(new Date(`${toISO.slice(0, 10)}T00:00:00.000Z`).getTime() + 24 * 3_600_000);

    const bookings = await this.prisma.booking.findMany({
      where: { tenantId, checkIn: { gte: from, lt: to } },
      select: { status: true, funnelStage: true, channel: true },
    });
    const count = <T extends string>(vals: (T | null)[]): Record<string, number> => {
      const acc: Record<string, number> = {};
      for (const v of vals) acc[v ?? 'UNKNOWN'] = (acc[v ?? 'UNKNOWN'] ?? 0) + 1;
      return acc;
    };

    const events = await this.prisma.funnelEventLog.groupBy({
      by: ['kind'],
      where: { tenantId, createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });

    return {
      total: bookings.length,
      byStatus: count(bookings.map((b) => b.status)),
      byStage: count(bookings.map((b) => b.funnelStage)),
      byChannel: count(bookings.map((b) => b.channel)),
      events: Object.fromEntries(events.map((e) => [e.kind, e._count._all])),
      // Ключевые метрики автоматизации: самозаезд без стойки и проблемы.
      autoCheckins: events.find((e) => e.kind === 'auto_checkin')?._count._all ?? 0,
      escalations: events.find((e) => e.kind === 'escalation')?._count._all ?? 0,
      keyFailures: events.find((e) => e.kind === 'key_failed')?._count._all ?? 0,
    };
  }
}
