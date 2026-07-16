import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { GuestAgentService } from '../agents/guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { WhatsAppPort } from '../../integrations/whatsapp/whatsapp.port.js';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';

/**
 * Оркестратор WhatsApp-канала: входящее сообщение (from jid, текст) → гостевой
 * AI-агент → ответ. Диалог привязывается к WhatsApp jid через externalId. Гость
 * анонимен; для брони агент предложит войти. Обработчик регистрируется в
 * WhatsAppService при старте модуля. По аналогии с TelegramAgentService/MaxAgentService.
 */
@Injectable()
export class WhatsAppAgentService implements OnModuleInit {
  private readonly logger = new Logger('WhatsAppAgent');

  constructor(
    private readonly guestAgent: GuestAgentService,
    private readonly conversations: ConversationService,
    private readonly wa: WhatsAppPort,
    private readonly waService: WhatsAppService,
    private readonly tenant: TenantService,
  ) {}

  onModuleInit(): void {
    this.waService.registerHandler((from, text) => this.handle(from, text));
  }

  async handle(from: string, text: string): Promise<void> {
    if (!text) return;
    try {
      const tenantId = await this.tenant.getDefaultTenantId();
      const existing = await this.conversations.findByExternal(tenantId, AiChannel.WHATSAPP, from);
      const res = await this.guestAgent.handle({
        conversationId: existing?.id,
        tenantId,
        channel: AiChannel.WHATSAPP,
        text,
      });
      if (!existing) await this.conversations.setExternalId(res.conversationId, from);
      await this.wa.sendMessage(from, res.reply);
    } catch (err) {
      this.logger.error(`Ошибка обработки входящего: ${(err as Error).message}`);
      await this.wa
        .sendMessage(from, 'Извините, произошёл сбой. Попробуйте ещё раз чуть позже.')
        .catch(() => undefined);
    }
  }
}
