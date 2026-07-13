import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { AiDirectoryModule } from '../directory/ai-directory.module.js';
import { OperatorInboxService } from './operator-inbox.service.js';
import { OperatorInboxController } from './operator-inbox.controller.js';

/** Лента эскалаций (operator inbox). TelegramPort — из @Global TelegramModule. */
@Module({
  imports: [ConversationsModule, AiDirectoryModule],
  controllers: [OperatorInboxController],
  providers: [OperatorInboxService, AdminAuthGuard],
})
export class InboxModule {}
