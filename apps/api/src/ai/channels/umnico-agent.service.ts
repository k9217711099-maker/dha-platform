import { Injectable, Logger } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { GuestAgentService } from '../agents/guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { UmnicoConfigService } from '../../integrations/umnico/umnico-config.service.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { ChannelToggleService } from './channel-toggle.service.js';

/** Входящее из Umnico (упрощённо): обращение + текст + адрес для ответа. */
export interface UmnicoIncoming {
  leadId: string;
  source?: string;
  userId?: string;
  saId?: string;
  text: string;
}

/**
 * Оркестратор канала Umnico: входящее сообщение (из вебхука message.incoming) →
 * гостевой AI-агент → ответ обратно через Umnico (POST /messaging/<leadId>/send).
 * Диалог привязывается к обращению Umnico (leadId) через externalId. По аналогии
 * с MaxAgentService. Umnico покрывает WhatsApp/Telegram/VK/Avito одним каналом.
 */
@Injectable()
export class UmnicoAgentService {
  private readonly logger = new Logger('UmnicoAgent');

  constructor(
    private readonly guestAgent: GuestAgentService,
    private readonly conversations: ConversationService,
    private readonly umnico: UmnicoConfigService,
    private readonly tenant: TenantService,
    private readonly toggle: ChannelToggleService,
  ) {}

  async handleIncoming(msg: UmnicoIncoming): Promise<void> {
    const text = msg.text?.trim();
    if (!msg.leadId || !text) return;
    try {
      // Канал Umnico выключен тумблером в админке — входящие игнорируем.
      if (!(await this.toggle.isChannelEnabledFor(AiChannel.UMNICO))) return;
      const tenantId = await this.tenant.getDefaultTenantId();
      const existing = await this.conversations.findByExternal(tenantId, AiChannel.UMNICO, msg.leadId);
      const res = await this.guestAgent.handle({
        conversationId: existing?.id,
        tenantId,
        channel: AiChannel.UMNICO,
        text,
      });
      if (!existing) await this.conversations.setExternalId(res.conversationId, msg.leadId);
      // Сохраняем адрес ответа (source/userId/saId) — без него оператор не сможет
      // ответить в Umnico из инбокса (в leadId этих полей нет, а они обязательны).
      await this.conversations.setChannelMeta(res.conversationId, {
        source: msg.source ?? null,
        userId: msg.userId ?? null,
        saId: msg.saId ?? null,
      });
      // Авто-ответ в мессенджер шлём ТОЛЬКО когда отвечает бот. При эскалации/выключенном
      // AI молчим — иначе гость получал бы «администратор скоро ответит» на каждое сообщение;
      // оператор ответит вручную из инбокса (OperatorInboxService → dispatchToChannel).
      if (!res.escalated && res.reply?.trim()) {
        await this.umnico.sendMessage(
          { leadId: msg.leadId, source: msg.source, userId: msg.userId, saId: msg.saId },
          res.reply,
        );
      }
    } catch (err) {
      this.logger.error(`Ошибка обработки входящего: ${(err as Error).message}`);
    }
  }
}
