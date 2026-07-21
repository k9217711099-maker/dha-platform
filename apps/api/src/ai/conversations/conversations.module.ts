import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service.js';
import { InboxEvents } from '../inbox/inbox.events.js';

/** Персистентность диалогов AI (использует глобальный PrismaService). */
@Module({
  providers: [ConversationService, InboxEvents],
  exports: [ConversationService, InboxEvents],
})
export class ConversationsModule {}
