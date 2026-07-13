import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { LlmModule } from '../ai/llm/llm.module.js';
import { PiiModule } from '../ai/pii/pii.module.js';
import { AclModule } from '../acl/acl.module.js';
import { KbController } from './kb.controller.js';
import { KbService } from './kb.service.js';
import { KbAskService } from './kb-ask.service.js';
import { KbImportService } from './import/kb-import.service.js';

/**
 * База знаний (KB-DRIVE-TZ.md): базы/дерево страниц/версии/постоянные ссылки/поиск
 * + импорт из ZIP-экспорта Bitrix24 + AI-ответы «спросить базу» (LlmPort + PII).
 * TenantService — из глобального PmsModule, JwtService — из глобального JwtModule.
 */
@Module({
  imports: [LlmModule, PiiModule, AclModule],
  controllers: [KbController],
  providers: [AdminAuthGuard, KbService, KbAskService, KbImportService, AuditService],
  exports: [KbService, KbAskService],
})
export class KbModule {}
