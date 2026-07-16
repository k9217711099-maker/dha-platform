import { Module } from '@nestjs/common';
import { LlmModule } from './llm/llm.module.js';
import { PiiModule } from './pii/pii.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { ToolsModule } from './tools/tools.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { TelegramModule } from '../integrations/telegram/telegram.module.js';
import { MaxModule } from '../integrations/max/max.module.js';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { InboxModule } from './inbox/inbox.module.js';
import { QaModule } from './qa/qa.module.js';

/**
 * Корневой модуль AI (система коммуникаций / агенты — AI-COMMUNICATIONS-TZ.md).
 * Этап 1: LLM-провайдер за портом (DeepSeek) + маскирование ПДн.
 * Этап 2: персистентность диалогов, реестр инструментов, гостевой агент.
 * Далее — RAG/база знаний, каналы (web/app/Telegram), копилот сотрудника.
 */
@Module({
  imports: [
    LlmModule,
    PiiModule,
    ConversationsModule,
    ToolsModule,
    AgentsModule,
    TelegramModule,
    MaxModule,
    WhatsAppModule,
    ChannelsModule,
    InboxModule,
    QaModule,
  ],
})
export class AiModule {}
