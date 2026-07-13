import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { QaAnalysisService } from './qa-analysis.service.js';
import { QaBatchDto } from './dto/qa-batch.dto.js';

/**
 * Дашборд и отчёты AI-контроля качества чатов (§5.7). Только админ с правом `ai_qa`.
 * Разбор идёт по обезличенным транскриптам; наружу отдаются баллы/метрики, не ПДн.
 */
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/qa')
@UseGuards(AdminAuthGuard)
@RequirePermission('ai_qa')
export class QaController {
  constructor(
    private readonly qa: QaAnalysisService,
    private readonly tenant: TenantService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Агрегаты качества за период (баллы, времена, SLA, тональность)' })
  async dashboard(@Query('days') days?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const d = Math.min(Math.max(Number(days) || 30, 1), 365);
    return this.qa.dashboard(tenantId, d);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Список QA-разборов диалогов' })
  async reviews(@Query('operatorId') operatorId?: string, @Query('limit') limit?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.qa.listReviews(tenantId, { operatorId, limit: Number(limit) || undefined });
  }

  @Get('reviews/:conversationId')
  @ApiOperation({ summary: 'QA-разбор конкретного диалога' })
  async review(@Param('conversationId') conversationId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const review = await this.qa.getReview(tenantId, conversationId);
    if (!review) throw new NotFoundException('Разбор не найден — сначала запустите анализ');
    return review;
  }

  @Post('analyze/:conversationId')
  @ApiOperation({ summary: 'Разобрать один диалог (метрики + QA-скоринг)' })
  analyze(@Param('conversationId') conversationId: string) {
    return this.qa.analyze(conversationId);
  }

  @Post('analyze-pending')
  @ApiOperation({ summary: 'Батч: разобрать неразобранные завершённые/эскалированные диалоги' })
  async analyzePending(@Body() dto: QaBatchDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.qa.analyzePending(tenantId, dto.limit ?? 20);
  }
}
