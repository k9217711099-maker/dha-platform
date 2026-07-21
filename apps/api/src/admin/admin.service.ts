import { Injectable, NotFoundException } from '@nestjs/common';
import { AiMessageRole, CheckinStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';

/** Чтение/агрегации для админ-панели (§17). */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** Логи синхронизаций и ошибки интеграций (§17). */
  syncLogs() {
    return this.prisma.integrationSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  /** Очередь онлайн-регистраций на проверку. */
  async checkinQueue(status: CheckinStatus = CheckinStatus.SUBMITTED) {
    const items = await this.prisma.checkin.findMany({
      where: { status },
      include: { booking: { include: { property: true } }, _count: { select: { documents: true } } },
      orderBy: { submittedAt: 'asc' },
      take: 50,
    });
    return items.map((c) => ({
      bookingId: c.bookingId,
      guestId: c.guestId,
      status: c.status,
      property: c.booking.property.name,
      adults: c.adults,
      documentsCount: c._count.documents,
      submittedAt: c.submittedAt,
      passportCheckStatus: c.passportCheckStatus,
      passportCheckNote: c.passportCheckNote,
    }));
  }

  /** Последние бронирования. */
  recentBookings() {
    return this.prisma.booking.findMany({
      include: { property: true, guest: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Профиль гостя + лояльность + брони (§17: смотреть профиль и уровень). */
  /**
   * Варианты регистра строки. ILIKE (`mode: insensitive`) в некоторых локалях БД
   * НЕ сворачивает регистр кириллицы (напр. встроенный dev-Postgres): «ким» не находит
   * «Ким». JS `toLowerCase/toUpperCase` работают с юникодом корректно, поэтому ищем по
   * набору вариантов регистра — работает независимо от локали БД.
   */
  private ciVariants(s: string): string[] {
    const lower = s.toLowerCase();
    const upper = s.toUpperCase();
    const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return [...new Set([s, lower, upper, cap])];
  }
  /** OR-условия «имя/фамилия содержит токен» без учёта регистра (в т.ч. кириллица). */
  private nameContains(token: string): Record<string, unknown>[] {
    const conds: Record<string, unknown>[] = [];
    for (const v of this.ciVariants(token)) conds.push({ firstName: { contains: v } }, { lastName: { contains: v } });
    return conds;
  }
  /**
   * Условие поиска гостя: телефон по цифрам (игнорируя формат «+7 (931)…»),
   * почта/ID подстрокой, имя+фамилия — по каждому токену (AND), чтобы «Ким Сергей»
   * находился независимо от порядка и от того, что в firstName, а что в lastName.
   * Регистр не важен (в т.ч. кириллица) — через `ciVariants`.
   */
  private guestWhere(query?: string) {
    const q = query?.trim();
    if (!q) return {};
    const digits = q.replace(/\D/g, '');
    const tokens = q.split(/\s+/).filter(Boolean);
    const OR: Record<string, unknown>[] = [{ id: { contains: q } }];
    for (const v of this.ciVariants(q)) OR.push({ email: { contains: v } });
    OR.push(...this.nameContains(q));
    if (digits.length >= 3) OR.push({ phone: { contains: digits } });
    if (tokens.length > 1) {
      OR.push({ AND: tokens.map((t) => ({ OR: this.nameContains(t) })) });
    }
    return { OR };
  }

  /** Поиск гостей по телефону, почте, фамилии или имени (или всех, если пусто). */
  async searchGuests(query?: string) {
    const guests = await this.prisma.guest.findMany({
      where: this.guestWhere(query),
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, loyaltyTier: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return guests;
  }

  /** База гостей списком с фильтрами (§9): поиск + уровень лояльности + счётчик броней. */
  async listGuests(params: { query?: string; tier?: string } = {}) {
    const guests = await this.prisma.guest.findMany({
      where: {
        ...(params.tier ? { loyaltyTier: params.tier as never } : {}),
        ...this.guestWhere(params.query),
      },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, loyaltyTier: true, guestNotes: true,
        createdAt: true, _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return guests.map((g) => ({
      id: g.id, firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone,
      loyaltyTier: g.loyaltyTier, guestNotes: g.guestNotes, createdAt: g.createdAt, bookingsCount: g._count.bookings,
    }));
  }

  /** Редактирование контактов гостя-заказчика из карточки брони. */
  async updateGuest(guestId: string, dto: { firstName?: string; lastName?: string; phone?: string; email?: string; guestNotes?: string }) {
    const guest = await this.prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) throw new NotFoundException('Гость не найден');
    return this.prisma.guest.update({
      where: { id: guestId },
      data: {
        firstName: dto.firstName ?? guest.firstName,
        lastName: dto.lastName ?? guest.lastName,
        phone: dto.phone !== undefined ? (dto.phone || null) : guest.phone,
        email: dto.email !== undefined ? (dto.email || null) : guest.email,
        guestNotes: dto.guestNotes !== undefined ? (dto.guestNotes || null) : guest.guestNotes,
      },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, loyaltyTier: true, guestNotes: true },
    });
  }

  async guestDetails(guestId: string) {
    const guest = await this.prisma.guest.findUnique({
      where: { id: guestId },
      include: { bookings: { include: { property: true }, orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!guest) throw new NotFoundException('Гость не найден');
    const loyalty = await this.loyalty.getSummary(guestId);
    return {
      id: guest.id,
      phone: guest.phone,
      email: guest.email,
      firstName: guest.firstName,
      lastName: guest.lastName,
      guestNotes: guest.guestNotes,
      loyaltyTier: guest.loyaltyTier,
      loyalty,
      bookings: guest.bookings.map((b) => ({
        id: b.id,
        property: b.property.name,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalPrice: b.totalPrice,
      })),
    };
  }

  /**
   * История переписки гостя (#8): все AI-диалоги, привязанные к гостю (по телефону/логину),
   * с содержательными сообщениями. Показывается в карточке гостя.
   */
  async guestConversations(guestId: string) {
    const convos = await this.prisma.aiConversation.findMany({
      where: { guestId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        channel: true,
        status: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: {
            role: { in: [AiMessageRole.USER, AiMessageRole.ASSISTANT, AiMessageRole.STAFF] },
          },
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true, createdAt: true },
        },
      },
    });
    const roleMap = { USER: 'user', ASSISTANT: 'ai', STAFF: 'staff' } as const;
    return convos.map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: c.messages.map((m) => ({
        role: roleMap[m.role as 'USER' | 'ASSISTANT' | 'STAFF'],
        text: m.content,
        createdAt: m.createdAt,
      })),
    }));
  }
}
