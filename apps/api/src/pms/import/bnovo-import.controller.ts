import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { BnovoImportService, type DeleteExistingMode } from './bnovo-import.service.js';

class ApplyImportDto {
  @IsOptional() @IsIn(['all', 'empty', 'hide', 'none']) deleteExisting?: DeleteExistingMode;
}

/** Импорт номерного фонда из Bnovo (категории + номера). RBAC — pms_properties. */
@ApiTags('pms-import')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/pms/import/bnovo')
export class BnovoImportController {
  constructor(
    private readonly service: BnovoImportService,
    private readonly tenant: TenantService,
  ) {}

  /** Предпросмотр: что доступно в Bnovo и какие категории уже есть у нас. */
  @Get('preview')
  @RequirePermission('pms_properties')
  async preview() {
    return this.service.preview(await this.tenant.getDefaultTenantId());
  }

  /** Применить импорт (+опционально удалить существующие категории). */
  @Post('apply')
  @RequirePermission('pms_properties')
  async apply(@Body() dto: ApplyImportDto, @CurrentAdminId() adminId: string) {
    return this.service.apply(await this.tenant.getDefaultTenantId(), dto.deleteExisting ?? 'none', adminId);
  }
}
