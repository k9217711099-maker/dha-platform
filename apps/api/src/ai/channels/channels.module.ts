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

/**
 * Каналы гостевого агента, требующие серверного адаптера. Этап E: Telegram
 * (TelegramPort — из @Global TelegramModule; TenantService — из @Global PmsModule).
 * Web/app ходят на /ai/guest/message напрямую с клиента. Привязка личности —
 * TelegramLinkService (deep-link §13). При блокировке вебхука — long polling
 * (TelegramPollingService, опрос через прокси).
 */
@Module({
  imports: [AgentsModule, ConversationsModule],
  controllers: [TelegramController, ChannelsAdminController],
  providers: [
    TelegramAgentService,
    TelegramLinkService,
    TelegramPollingService,
    AdminAuthGuard,
    AuditService,
  ],
})
export class ChannelsModule {}
