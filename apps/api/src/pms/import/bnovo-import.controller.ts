import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { BnovoConfigService } from '../../integrations/bnovo/bnovo-config.service.js';
import { BnovoAuthService } from '../../integrations/bnovo/bnovo-auth.service.js';
import { BnovoImportService, type DeleteExistingMode } from './bnovo-import.service.js';

class ApplyImportDto {
  @IsOptional() @IsIn(['all', 'empty', 'hide', 'none']) deleteExisting?: DeleteExistingMode;
}

/** Реквизиты Bnovo из админки: id аккаунта + ключ API (ключ — только на запись). */
class SaveBnovoConfigDto {
  @IsOptional() @Type(() => Number) @IsInt() accountId?: number;
  @IsOptional() @IsString() apiKey?: string;
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
    private readonly config: BnovoConfigService,
    private readonly auth: BnovoAuthService,
  ) {}

  /** Текущие реквизиты подключения Bnovo (без ключа). */
  @Get('config')
  @RequirePermission('pms_properties')
  bnovoConfig() {
    return this.config.getPublicConfig();
  }

  /** Сохранить реквизиты Bnovo (id аккаунта + ключ API). */
  @Put('config')
  @RequirePermission('pms_properties')
  async saveConfig(@Body() dto: SaveBnovoConfigDto) {
    await this.config.save({ accountId: dto.accountId, apiKey: dto.apiKey });
    this.auth.invalidate(); // сбросить кэш токена — следующий запрос авторизуется новыми реквизитами
    return this.config.getPublicConfig();
  }

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
