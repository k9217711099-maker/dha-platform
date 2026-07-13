import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { CleaningPlanService } from './cleaning-plan.service.js';
import { PlanAssignDto, PlanAutoDto, PlanSendDto } from './dto/ops.dto.js';

/** План уборок (§6.3). Право — ops_cleaning_plan. */
@ApiTags('ops-cleaning-plan')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@RequirePermission('ops_cleaning_plan')
@Controller('v1/ops/cleaning/plan')
export class CleaningPlanController {
  constructor(
    private readonly plan: CleaningPlanService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  async get(@Query('date') date?: string, @Query('propertyId') propertyId?: string) {
    return this.plan.plan(await this.tenant.getDefaultTenantId(), date ?? new Date().toISOString(), propertyId);
  }

  @Post('assign')
  async assign(@Body() dto: PlanAssignDto, @Req() req: AdminRequest) {
    return this.plan.assign(await this.tenant.getDefaultTenantId(), dto.taskId, dto.userId ?? null, dto.planOrder, req.adminId);
  }

  @Post('autodistribute')
  async auto(@Body() dto: PlanAutoDto, @Req() req: AdminRequest) {
    return this.plan.autodistribute(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  @Post('send')
  async send(@Body() dto: PlanSendDto, @Req() req: AdminRequest) {
    return this.plan.send(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  @Post('cancel')
  async cancel(@Body() dto: PlanSendDto, @Req() req: AdminRequest) {
    return this.plan.cancel(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  /** Ручной запуск генерации по правилам (обычно — ночной cron §12.3). */
  @Post('generate')
  async generate(@Body() body: { date?: string; propertyId?: string }) {
    return this.plan.generate(await this.tenant.getDefaultTenantId(), body.date ?? new Date().toISOString(), body.propertyId);
  }
}
