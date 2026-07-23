import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { AgentsModule } from '../agents/agents.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { ChannelsAdminController } from './channels-admin.controller.js';
import { TelegramAgentService } from './telegram-agent.service.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramPollingService } from './telegram-polling.service.js';
import { MaxAgentService } from './max-agent.service.js';
import { MaxController } from './max.controller.js';
import { MaxPollingService } from './max-polling.service.js';
import { WhatsAppAgentService } from './whatsapp-agent.service.js';
import { TgUserbotAgentService } from './tg-userbot-agent.service.js';
import { UmnicoAgentService } from './umnico-agent.service.js';
import { UmnicoController } from './umnico.controller.js';
import { ChannelToggleService } from './channel-toggle.service.js';
import { AttachmentStorageService } from '../../staff-chat/attachment-storage.service.js';

/**
 * Каналы гостевого агента, требующие серверного адаптера. Этап E: Telegram
 * (TelegramPort — из @Global TelegramModule; TenantService — из @Global PmsModule).
 * Web/app ходят на /ai/guest/message напрямую с клиента. Привязка личности —
 * TelegramLinkService (deep-link §13). При блокировке вебхука — long polling
 * (TelegramPollingService, опрос через прокси).
 */
@Module({
  imports: [AgentsModule, ConversationsModule],
  controllers: [TelegramController, MaxController, UmnicoController, ChannelsAdminController],
  providers: [
    TelegramAgentService,
    TelegramLinkService,
    TelegramPollingService,
    MaxAgentService,
    MaxPollingService,
    WhatsAppAgentService,
    TgUserbotAgentService,
    UmnicoAgentService,
    ChannelToggleService,
    AdminAuthGuard,
    AuditService,
    AttachmentStorageService,
  ],
  exports: [UmnicoAgentService],
})
export class ChannelsModule {}
