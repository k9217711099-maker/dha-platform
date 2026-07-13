import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { StaffChatController } from './staff-chat.controller.js';
import { StaffChatStreamController } from './staff-chat.stream.controller.js';
import { StaffChatService } from './staff-chat.service.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { StaffChatEvents } from './staff-chat.events.js';

/**
 * Внутренний мессенджер сотрудников (§2). PrismaService/TenantService/JwtService —
 * из @Global-модулей. Realtime — SSE (StaffChatStreamController + StaffChatEvents);
 * опрос оставлен как fallback. Вложения — AttachmentStorageService (/uploads).
 */
@Module({
  controllers: [StaffChatController, StaffChatStreamController],
  providers: [StaffChatService, AttachmentStorageService, StaffChatEvents, AdminAuthGuard],
})
export class StaffChatModule {}
