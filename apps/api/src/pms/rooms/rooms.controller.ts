import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { RoomService } from './room.service.js';
import { BatchCreateRoomsDto, BulkCreateRoomsDto, BulkInstructionsDto, CreateRoomDto, ReorderRoomsDto, RoomStatusDto, UpdateRoomDto } from './dto/room.dto.js';

/**
 * Номерной фонд PMS (юниты). Маршруты `/api/v1/rooms` (совпадают с DHP OpenAPI).
 * Авторизация — общий AdminAuthGuard + RBAC по ключу pms_rooms. tenantId пока
 * резолвится как дефолтный арендатор (single-tenant), но код tenant-aware.
 */
@ApiTags('pms-rooms')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_rooms')
  async list(@Query('propertyId') propertyId?: string, @Query('roomTypeId') roomTypeId?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.list(tenantId, { propertyId, roomTypeId });
  }

  // Статичный маршрут — до параметрического ':id'.
  @Get('options')
  @RequirePermission('pms_rooms')
  async options() {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.catalogOptions(tenantId);
  }

  @Get(':id')
  @RequirePermission('pms_rooms')
  async get(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.get(tenantId, id);
  }

  @Post()
  @RequirePermission('pms_rooms')
  async create(@Body() dto: CreateRoomDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.create(tenantId, dto, adminId);
  }

  // Массовое добавление по диапазону (101…105). Статичный маршрут — до ':id'.
  @Post('bulk')
  @RequirePermission('pms_rooms')
  async bulkCreate(@Body() dto: BulkCreateRoomsDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.bulkCreate(tenantId, dto, adminId);
  }

  // Множественное добавление разных номеров в одном окне.
  @Post('batch')
  @RequirePermission('pms_rooms')
  async batchCreate(@Body() dto: BatchCreateRoomsDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.batchCreate(tenantId, dto, adminId);
  }

  // Порядок номеров (перетаскивание). Статичный маршрут — до ':id'.
  @Post('reorder')
  @RequirePermission('pms_rooms')
  async reorder(@Body() dto: ReorderRoomsDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.reorder(tenantId, dto.ids, adminId);
  }

  // Массовое заполнение инструкций/адресов заселения (апартаменты). Статичный — до ':id'.
  @Post('instructions')
  @RequirePermission('pms_rooms')
  async bulkInstructions(@Body() dto: BulkInstructionsDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.bulkInstructions(tenantId, dto, adminId);
  }

  @Patch(':id')
  @RequirePermission('pms_rooms')
  async update(@Param('id') id: string, @Body() dto: UpdateRoomDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.update(tenantId, id, dto, adminId);
  }

  @Post(':id/status')
  @RequirePermission('pms_rooms')
  async setStatus(@Param('id') id: string, @Body() dto: RoomStatusDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.setStatus(tenantId, id, dto, adminId);
  }

  @Delete(':id')
  @RequirePermission('pms_rooms')
  async remove(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rooms.remove(tenantId, id, adminId);
  }
}
