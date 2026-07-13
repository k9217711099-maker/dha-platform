import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service.js';

/** Персистентность диалогов AI (использует глобальный PrismaService). */
@Module({
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationsModule {}
