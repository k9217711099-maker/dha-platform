import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { RoomTypeService } from './room-type.service.js';
import { CreateRoomTypeDto, ReorderRoomTypesDto, RoomTypeVisibilityDto, UpdateRoomTypeDto } from './dto/room-type.dto.js';

/**
 * Категории номеров раздела «Номерной фонд» (Путь B). `/api/v1/room-types`.
 * RBAC pms_roomtypes; статичные маршруты (reorder/changelog) — до параметрического ':id'.
 */
@ApiTags('pms-rooms')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/room-types')
export class RoomTypesController {
  constructor(
    private readonly roomTypes: RoomTypeService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_roomtypes')
  async list(@Query('propertyId') propertyId?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.list(tenantId, propertyId);
  }

  @Get('changelog')
  @RequirePermission('pms_roomtypes')
  async changelog(
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.changelog(tenantId, { entity, action, from, to });
  }

  @Get('amenities')
  @RequirePermission('pms_roomtypes')
  amenities() {
    return this.roomTypes.amenitiesCatalog();
  }

  @Post()
  @RequirePermission('pms_roomtypes')
  async create(@Body() dto: CreateRoomTypeDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.create(tenantId, dto, adminId);
  }

  @Patch('reorder')
  @RequirePermission('pms_roomtypes')
  async reorder(@Body() dto: ReorderRoomTypesDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.reorder(tenantId, dto, adminId);
  }

  @Get(':id')
  @RequirePermission('pms_roomtypes')
  async get(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.get(tenantId, id);
  }

  @Patch(':id')
  @RequirePermission('pms_roomtypes')
  async update(@Param('id') id: string, @Body() dto: UpdateRoomTypeDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.update(tenantId, id, dto, adminId);
  }

  @Patch(':id/visibility')
  @RequirePermission('pms_roomtypes')
  async setVisibility(@Param('id') id: string, @Body() dto: RoomTypeVisibilityDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.setVisibility(tenantId, id, dto, adminId);
  }

  @Post(':id/duplicate')
  @RequirePermission('pms_roomtypes')
  async duplicate(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.duplicate(tenantId, id, adminId);
  }

  @Delete(':id')
  @RequirePermission('pms_roomtypes')
  async remove(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.roomTypes.remove(tenantId, id, adminId);
  }
}
