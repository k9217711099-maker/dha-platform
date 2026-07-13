import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Гостевые ссылки заселения (CHECK-IN-TZ §4, magic-link). Токен ≥128 бит даёт
 * ограниченную сессию только на одну бронь: регистрация, оплата, ключ — без
 * аккаунта (сценарии OTA и «прямая бронь без ЛК»). Отзывается после выезда.
 */
@Injectable()
export class GuestCheckinLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Выпустить (или вернуть действующую) ссылку на бронь. */
  async issueFor(bookingId: string): Promise<{ token: string; url: string }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { tenantId: true, checkOut: true, status: true },
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');

    const existing = await this.prisma.guestCheckinLink.findUnique({ where: { bookingId } });
    const alive =
      existing && !existing.revokedAt && (!existing.expiresAt || existing.expiresAt > new Date());
    if (alive) return { token: existing.token, url: this.url(existing.token) };

    // Срок жизни: до суток после выезда (дальше ключ уже отозван, ссылка не нужна).
    const expiresAt = new Date(booking.checkOut.getTime() + 24 * 3_600_000);
    const token = randomBytes(16).toString('hex'); // 128 бит
    await this.prisma.guestCheckinLink.upsert({
      where: { bookingId },
      create: { tenantId: booking.tenantId, bookingId, token, expiresAt },
      // Перевыпуск: ротация токена (старый перестаёт действовать), снятие отзыва.
      update: { token, expiresAt, revokedAt: null },
    });
    return { token, url: this.url(token) };
  }

  /** Разрешить токен → бронь (или null). Счётчик открытий — только по countOpen. */
  async resolve(token: string, countOpen = false): Promise<{ bookingId: string; tenantId: string } | null> {
    if (!/^[a-f0-9]{32}$/.test(token)) return null;
    const link = await this.prisma.guestCheckinLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) return null;
    if (countOpen) {
      await this.prisma.guestCheckinLink
        .update({ where: { id: link.id }, data: { openCount: { increment: 1 } } })
        .catch(() => undefined);
    }
    return { bookingId: link.bookingId, tenantId: link.tenantId };
  }

  /** Отозвать ссылку брони (выезд/подозрение). */
  async revokeFor(bookingId: string): Promise<void> {
    await this.prisma.guestCheckinLink
      .updateMany({ where: { bookingId, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  url(token: string): string {
    const base = this.config.get('GUEST_PORTAL_BASE_URL', { infer: true });
    return `${base.replace(/\/$/, '')}/s/checkin/${token}`;
  }
}
