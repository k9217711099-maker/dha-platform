import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Env } from '../../config/env.schema.js';

interface TgLinkPayload {
  sub: string;
  typ?: string;
}

/**
 * Привязка Telegram-чата к аккаунту гостя (deep-link авторизация §13). Гость,
 * будучи авторизованным в web/app, получает одноразовый токен и открывает
 * `t.me/<bot>?start=<token>`; бот получает `/start <token>`, backend проверяет
 * токен и связывает chatId с guestId. Токен — подписанный JWT с меткой `tg_link`
 * (не путается с обычным access-токеном: у того нет typ) и коротким сроком жизни.
 */
@Injectable()
export class TelegramLinkService {
  private readonly ttlSec = 900; // 15 минут

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Токен привязки для авторизованного гостя + deep-link на бота. */
  async createLinkToken(
    guestId: string,
  ): Promise<{ token: string; deepLink: string | null; expiresInSec: number }> {
    const token = await this.jwt.signAsync(
      { sub: guestId, typ: 'tg_link' },
      { expiresIn: this.ttlSec },
    );
    const bot = this.config.get('TELEGRAM_BOT_USERNAME', { infer: true });
    return {
      token,
      deepLink: bot ? `https://t.me/${bot}?start=${token}` : null,
      expiresInSec: this.ttlSec,
    };
  }

  /** Проверяет токен привязки → guestId (null, если невалиден/просрочен/не того типа). */
  async consumeToken(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<TgLinkPayload>(token);
      return payload.typ === 'tg_link' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /** Привязывает Telegram chat к гостю (chatId уникален — снимаем с прежнего аккаунта). */
  async linkChat(chatId: string, guestId: string): Promise<{ firstName: string | null } | null> {
    const guest = await this.prisma.guest.findUnique({
      where: { id: guestId },
      select: { id: true },
    });
    if (!guest) return null;
    await this.prisma.guest.updateMany({
      where: { telegramChatId: chatId, NOT: { id: guestId } },
      data: { telegramChatId: null },
    });
    return this.prisma.guest.update({
      where: { id: guestId },
      data: { telegramChatId: chatId },
      select: { firstName: true },
    });
  }

  /** guestId, привязанный к Telegram chat (или null). */
  async guestIdForChat(chatId: string): Promise<string | null> {
    const guest = await this.prisma.guest.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    return guest?.id ?? null;
  }
}
