import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { GuestAgentService } from '../agents/guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { TelegramUserbotPort } from '../../integrations/telegram-userbot/telegram-userbot.port.js';
import { TelegramUserbotService } from '../../integrations/telegram-userbot/telegram-userbot.service.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';

/**
 * Оркестратор канала Telegram Direct (userbot): входящее личное сообщение
 * (from userId, текст) → гостевой AI-агент → ответ от личного аккаунта. Диалог
 * привязывается к userId через externalId, канал TELEGRAM_DIRECT (отдельно от бота).
 * По аналогии с WhatsAppAgentService.
 */
@Injectable()
export class TgUserbotAgentService implements OnModuleInit {
  private readonly logger = new Logger('TgUserbotAgent');

  constructor(
    private readonly guestAgent: GuestAgentService,
    private readonly conversations: ConversationService,
    private readonly userbot: TelegramUserbotPort,
    private readonly userbotService: TelegramUserbotService,
    private readonly tenant: TenantService,
  ) {}

  onModuleInit(): void {
    this.userbotService.registerHandler((from, text) => this.handle(from, text));
  }

  async handle(from: string, text: string): Promise<void> {
    if (!text) return;
    try {
      const tenantId = await this.tenant.getDefaultTenantId();
      const existing = await this.conversations.findByExternal(tenantId, AiChannel.TELEGRAM_DIRECT, from);
      const res = await this.guestAgent.handle({
        conversationId: existing?.id,
        tenantId,
        channel: AiChannel.TELEGRAM_DIRECT,
        text,
      });
      if (!existing) await this.conversations.setExternalId(res.conversationId, from);
      await this.userbot.sendMessage(from, res.reply);
    } catch (err) {
      this.logger.error(`Ошибка обработки входящего: ${(err as Error).message}`);
      await this.userbot
        .sendMessage(from, 'Извините, произошёл сбой. Попробуйте ещё раз чуть позже.')
        .catch(() => undefined);
    }
  }
}
