import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SyncJobType } from '@prisma/client';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../admin/current-admin.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { ChannelService } from './channel.service.js';
import { ChannelSyncService } from './channel-sync.service.js';
import { CreateChannelDto, EnqueueSyncDto, SetMappingDto, UpdateChannelDto } from './dto/channel.dto.js';

/**
 * Управление каналами продаж (DHP Channel Manager). Маршруты `/api/v1/channels`.
 * RBAC — pms_channels (revenue-контур). Приём броней из каналов — отдельный публичный контроллер.
 */
@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/channels')
export class ChannelsController {
  constructor(
    private readonly channels: ChannelService,
    private readonly sync: ChannelSyncService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_channels')
  async list() {
    return this.channels.list(await this.tenant.getDefaultTenantId());
  }

  @Post()
  @RequirePermission('pms_channels')
  async create(@Body() dto: CreateChannelDto, @CurrentAdminId() adminId: string) {
    return this.channels.create(await this.tenant.getDefaultTenantId(), dto, adminId);
  }

  // Обработать готовые задачи синхронизации (планировщик делает это по расписанию; тут — вручную).
  @Post('run-sync')
  @RequirePermission('pms_channels')
  async runSync() {
    return this.sync.processPending();
  }

  // Ручной повтор задачи синхронизации (в т.ч. из dead-letter).
  @Post('sync-jobs/:jobId/retry')
  @RequirePermission('pms_channels')
  async retryJob(@Param('jobId') jobId: string) {
    return this.sync.retryJob(await this.tenant.getDefaultTenantId(), jobId);
  }

  @Get(':id')
  @RequirePermission('pms_channels')
  async get(@Param('id') id: string) {
    return this.channels.monitoring(await this.tenant.getDefaultTenantId(), id);
  }

  @Patch(':id')
  @RequirePermission('pms_channels')
  async update(@Param('id') id: string, @Body() dto: UpdateChannelDto, @CurrentAdminId() adminId: string) {
    return this.channels.update(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Get(':id/mappings')
  @RequirePermission('pms_channels')
  async mappings(@Param('id') id: string) {
    return this.channels.listMappings(await this.tenant.getDefaultTenantId(), id);
  }

  @Put(':id/mappings/property')
  @RequirePermission('pms_channels')
  async mapProperty(@Param('id') id: string, @Body() dto: SetMappingDto, @CurrentAdminId() adminId: string) {
    return this.channels.setMapping(await this.tenant.getDefaultTenantId(), id, 'property', dto, adminId);
  }

  @Put(':id/mappings/room-type')
  @RequirePermission('pms_channels')
  async mapRoomType(@Param('id') id: string, @Body() dto: SetMappingDto, @CurrentAdminId() adminId: string) {
    return this.channels.setMapping(await this.tenant.getDefaultTenantId(), id, 'room-type', dto, adminId);
  }

  @Put(':id/mappings/rate-plan')
  @RequirePermission('pms_channels')
  async mapRatePlan(@Param('id') id: string, @Body() dto: SetMappingDto, @CurrentAdminId() adminId: string) {
    return this.channels.setMapping(await this.tenant.getDefaultTenantId(), id, 'rate-plan', dto, adminId);
  }

  @Post(':id/sync')
  @RequirePermission('pms_channels')
  async enqueueSync(@Param('id') id: string, @Body() dto: EnqueueSyncDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.sync.enqueue(tenantId, id, dto.jobType ?? SyncJobType.AVAILABILITY, dto.propertyId);
  }

  @Get(':id/sync-jobs')
  @RequirePermission('pms_channels')
  async syncJobs(@Param('id') id: string) {
    return this.channels.listSyncJobs(await this.tenant.getDefaultTenantId(), id);
  }

  @Get(':id/logs')
  @RequirePermission('pms_channels')
  async logs(@Param('id') id: string) {
    return this.channels.listLogs(await this.tenant.getDefaultTenantId(), id);
  }
}
