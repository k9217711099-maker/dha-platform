import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { OpsReportsService } from './ops-reports.service.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Отчёты «Задачи и Уборка» (§9). Право — ops_reports. */
@ApiTags('ops-reports')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@RequirePermission('ops_reports')
@Controller('v1/ops/reports')
export class OpsReportsController {
  constructor(
    private readonly reports: OpsReportsService,
    private readonly tenant: TenantService,
  ) {}

  @Get('dashboard')
  async dashboard(@Query('propertyId') propertyId?: string) {
    return this.reports.dashboard(await this.tenant.getDefaultTenantId(), propertyId);
  }

  @Get('tasks')
  async tasks(@Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string) {
    return this.reports.tasksReport(await this.tenant.getDefaultTenantId(), from, to, propertyId);
  }

  @Get('cleanings')
  async cleanings(@Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string, @Query('userId') userId?: string) {
    return this.reports.cleaningsReport(await this.tenant.getDefaultTenantId(), from, to, propertyId, userId);
  }

  /** Повторные заявки (LQA): тот же номер + тот же тег ≥2 раз за период. */
  @Get('repeats')
  async repeats(@Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string) {
    return this.reports.repeats(await this.tenant.getDefaultTenantId(), from, to, propertyId);
  }

  @Get('timeline')
  async timeline(@Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string) {
    return this.reports.timeline(await this.tenant.getDefaultTenantId(), from, to, propertyId);
  }

  @Get('checklists')
  async checklists(@Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string) {
    return this.reports.checklistAnalytics(await this.tenant.getDefaultTenantId(), from, to, propertyId);
  }

  @Get('pro')
  async pro(@Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string) {
    return this.reports.proReport(await this.tenant.getDefaultTenantId(), from, to, propertyId);
  }

  @Get('tasks/export.xlsx')
  @Header('Content-Type', XLSX_MIME)
  async tasksExport(@Res() res: Response, @Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string) {
    const buf = await this.reports.tasksExport(await this.tenant.getDefaultTenantId(), from, to, propertyId);
    res.setHeader('Content-Disposition', 'attachment; filename="ops-tasks-report.xlsx"');
    res.end(buf);
  }

  @Get('cleanings/export.xlsx')
  @Header('Content-Type', XLSX_MIME)
  async cleaningsExport(@Res() res: Response, @Query('from') from: string, @Query('to') to: string, @Query('propertyId') propertyId?: string, @Query('userId') userId?: string) {
    const buf = await this.reports.cleaningsExport(await this.tenant.getDefaultTenantId(), from, to, propertyId, userId);
    res.setHeader('Content-Disposition', 'attachment; filename="ops-cleanings-report.xlsx"');
    res.end(buf);
  }
}
