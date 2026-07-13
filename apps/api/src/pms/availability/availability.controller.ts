import { Body, Controller, Delete, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { AvailabilityService } from './availability.service.js';
import { CreateBlockDto, CreateLockDto, SearchAvailabilityDto } from './dto/availability.dto.js';

/**
 * Availability Engine (DHP §21). Маршруты `/api/v1/availability/*` (совпадают с OpenAPI).
 * RBAC — pms_availability. Источник истины по доступности — наш PMS (не Bnovo/каналы).
 */
@ApiTags('pms-availability')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/availability')
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly tenant: TenantService,
  ) {}

  @Get('search')
  @RequirePermission('pms_availability')
  async search(@Query() query: SearchAvailabilityDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.availability.search(tenantId, query);
  }

  @Post('lock')
  @RequirePermission('pms_availability')
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Повтор с тем же ключом вернёт тот же живой лок' })
  async createLock(
    @Body() dto: CreateLockDto,
    @CurrentAdminId() adminId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.availability.createLock(tenantId, dto, adminId, idempotencyKey);
  }

  @Delete('lock/:id')
  @RequirePermission('pms_availability')
  async releaseLock(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.availability.releaseLock(tenantId, id, adminId);
  }

  @Get('blocks')
  @RequirePermission('pms_availability')
  async listBlocks(@Query('propertyId') propertyId?: string, @Query('roomId') roomId?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.availability.listBlocks(tenantId, { propertyId, roomId });
  }

  @Post('blocks')
  @RequirePermission('pms_availability')
  async createBlock(@Body() dto: CreateBlockDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.availability.createBlock(tenantId, dto, adminId);
  }

  @Delete('blocks/:id')
  @RequirePermission('pms_availability')
  async removeBlock(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.availability.removeBlock(tenantId, id, adminId);
  }
}
