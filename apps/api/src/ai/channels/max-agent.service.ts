import { Injectable, Logger } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { GuestAgentService } from '../agents/guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { MaxPort } from '../../integrations/max/max.port.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';

const MAX_GREETING =
  'Здравствуйте! Я AI-администратор D Hotels & Apartments 🙂 Помогу подобрать номер и ответить на вопросы. ' +
  'Чтобы оформить бронь и оплату от вашего имени, войдите в приложении D H&A.';

/** Минимальная форма апдейта MAX (TamTam Bot API) — нужны текст и chat_id. */
export interface MaxUpdate {
  update_type?: string;
  message?: {
    sender?: { user_id?: number };
    recipient?: { chat_id?: number };
    body?: { text?: string };
  };
}

/**
 * Оркестратор MAX-канала: входящий апдейт message_created → гостевой AI-агент →
 * ответ в чат. Диалог привязывается к MAX chat_id через AiConversation.externalId,
 * поэтому переписка продолжается. Гость анонимен (guestId неизвестен); для брони
 * агент предложит войти. По аналогии с TelegramAgentService.
 */
@Injectable()
export class MaxAgentService {
  private readonly logger = new Logger('MaxAgent');

  constructor(
    private readonly guestAgent: GuestAgentService,
    private readonly conversations: ConversationService,
    private readonly max: MaxPort,
    private readonly tenant: TenantService,
  ) {}

  async handleUpdate(update: MaxUpdate): Promise<void> {
    if (update.update_type && update.update_type !== 'message_created') return;
    const chatId = update.message?.recipient?.chat_id;
    const text = update.message?.body?.text?.trim();
    if (chatId === undefined || !text) return; // не текстовое сообщение — игнорируем
    const chat = String(chatId);

    try {
      const tenantId = await this.tenant.getDefaultTenantId();

      // /start[@bot] [payload] — приветствие (привязку аккаунта добавим позже).
      if (/^\/start(?:@\S+)?(?:\s|$)/.test(text)) {
        await this.max.sendMessage(chatId, MAX_GREETING);
        return;
      }

      const existing = await this.conversations.findByExternal(tenantId, AiChannel.MAX, chat);
      const res = await this.guestAgent.handle({
        conversationId: existing?.id,
        tenantId,
        channel: AiChannel.MAX,
        text,
      });
      if (!existing) await this.conversations.setExternalId(res.conversationId, chat);
      await this.max.sendMessage(chatId, res.reply);
    } catch (err) {
      this.logger.error(`Ошибка обработки апдейта: ${(err as Error).message}`);
      await this.max
        .sendMessage(chatId, 'Извините, произошёл сбой. Попробуйте ещё раз чуть позже.')
        .catch(() => undefined);
    }
  }
}
