import { Injectable, Logger } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { GuestAgentService } from '../agents/guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramPort } from '../../integrations/telegram/telegram.port.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { ChannelToggleService } from './channel-toggle.service.js';

const TG_GREETING =
  'Здравствуйте! Я AI-администратор D Hotels & Apartments 🙂 Помогу подобрать номер и ответить на вопросы. ' +
  'Чтобы я мог оформить бронь и оплату от вашего имени, привяжите аккаунт кнопкой «Подключить Telegram» в приложении D H&A.';

/** Минимальная форма апдейта Telegram — нам нужны только текст и chat id. */
export interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

/**
 * Оркестратор Telegram-канала: входящий апдейт → гостевой AI-агент → ответ в чат.
 * Диалог привязывается к Telegram chat id через AiConversation.externalId, поэтому
 * переписка продолжается между сообщениями. Гость анонимен (guestId неизвестен);
 * для брони агент предложит войти. Привязка личности (телефон/deep-link) — §13 ТЗ.
 */
@Injectable()
export class TelegramAgentService {
  private readonly logger = new Logger('TelegramAgent');

  constructor(
    private readonly guestAgent: GuestAgentService,
    private readonly conversations: ConversationService,
    private readonly link: TelegramLinkService,
    private readonly telegram: TelegramPort,
    private readonly tenant: TenantService,
    private readonly toggle: ChannelToggleService,
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!(await this.toggle.isEnabled('telegram'))) return; // канал выключен тумблером
    const chatId = update.message?.chat?.id;
    const text = update.message?.text?.trim();
    if (chatId === undefined || !text) return; // не текстовое сообщение — игнорируем
    const chat = String(chatId);

    try {
      const tenantId = await this.tenant.getDefaultTenantId();

      // Команда привязки аккаунта: /start <token> (deep-link §13). В группах бывает /start@bot.
      const start = text.match(/^\/start(?:@\S+)?(?:\s+(.*))?$/s);
      if (start) {
        await this.handleStart(chatId, chat, tenantId, (start[1] ?? '').trim());
        return;
      }

      const guestId = (await this.link.guestIdForChat(chat)) ?? undefined;
      const existing = await this.conversations.findByExternal(tenantId, AiChannel.TELEGRAM, chat);
      // Диалог был анонимным, а гость уже привязан — до-привязываем, чтобы авторизация действовала.
      if (existing && !existing.guestId && guestId) {
        await this.conversations.setGuestId(existing.id, guestId);
      }
      const res = await this.guestAgent.handle({
        conversationId: existing?.id,
        tenantId,
        guestId,
        channel: AiChannel.TELEGRAM,
        text,
      });
      if (!existing) await this.conversations.setExternalId(res.conversationId, chat);
      await this.telegram.sendMessage(chatId, res.reply);
    } catch (err) {
      this.logger.error(`Ошибка обработки апдейта: ${(err as Error).message}`);
      await this.telegram
        .sendMessage(chatId, 'Извините, произошёл сбой. Попробуйте ещё раз чуть позже.')
        .catch(() => undefined);
    }
  }

  /** Обработка /start: с токеном — привязка аккаунта, без — приветствие. */
  private async handleStart(
    chatId: number,
    chat: string,
    tenantId: string,
    token: string,
  ): Promise<void> {
    if (!token) {
      await this.telegram.sendMessage(chatId, TG_GREETING);
      return;
    }
    const guestId = await this.link.consumeToken(token);
    if (!guestId) {
      await this.telegram.sendMessage(
        chatId,
        'Ссылка привязки недействительна или устарела — запросите новую в приложении D H&A.',
      );
      return;
    }
    const guest = await this.link.linkChat(chat, guestId);
    // Привязать текущий открытый диалог к гостю, чтобы авторизация действовала сразу.
    const existing = await this.conversations.findByExternal(tenantId, AiChannel.TELEGRAM, chat);
    if (existing && existing.guestId !== guestId) {
      await this.conversations.setGuestId(existing.id, guestId);
    }
    const hi = guest?.firstName ? `, ${guest.firstName}` : '';
    await this.telegram.sendMessage(
      chatId,
      `Готово${hi}! Ваш аккаунт D H&A привязан — теперь помогу подобрать номер, оформить бронь и оплату прямо здесь. Чем могу помочь?`,
    );
  }
}
