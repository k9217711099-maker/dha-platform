import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { AiDirectoryModule } from '../directory/ai-directory.module.js';
import { QaAnalysisService } from './qa-analysis.service.js';
import { QaController } from './qa.controller.js';

/**
 * AI-контроль качества чатов (§5.7). PrismaService/LlmPort/PiiMaskingService и
 * TenantService приходят из @Global-модулей (Prisma/Llm/Pii/Pms).
 */
@Module({
  imports: [AiDirectoryModule],
  controllers: [QaController],
  providers: [QaAnalysisService, AdminAuthGuard],
})
export class QaModule {}
