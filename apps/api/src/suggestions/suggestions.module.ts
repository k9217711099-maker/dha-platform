import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AttachmentStorageService } from '../staff-chat/attachment-storage.service.js';
import { SuggestionsController } from './suggestions.controller.js';
import { SuggestionService } from './suggestion.service.js';

/** Идеи/пожелания по доработке системы (#1). Prisma/Tenant/Jwt — из @Global-модулей. */
@Module({
  controllers: [SuggestionsController],
  providers: [SuggestionService, AttachmentStorageService, AdminAuthGuard],
})
export class SuggestionsModule {}
