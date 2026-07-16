import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { PropertyService, type PropertyInput } from './property.service.js';

/** Объекты размещения. `/api/v1/properties`, RBAC pms_properties. */
@ApiTags('pms-properties')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/properties')
export class PropertyController {
  constructor(
    private readonly properties: PropertyService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_properties')
  async list() {
    return this.properties.list(await this.tenant.getDefaultTenantId());
  }

  @Get(':id')
  @RequirePermission('pms_properties')
  async get(@Param('id') id: string) {
    return this.properties.get(await this.tenant.getDefaultTenantId(), id);
  }

  @Post()
  @RequirePermission('pms_properties')
  async create(@Body() dto: PropertyInput, @CurrentAdminId() actorId?: string) {
    return this.properties.create(await this.tenant.getDefaultTenantId(), dto, actorId);
  }

  @Patch(':id')
  @RequirePermission('pms_properties')
  async update(@Param('id') id: string, @Body() dto: PropertyInput, @CurrentAdminId() actorId?: string) {
    return this.properties.update(await this.tenant.getDefaultTenantId(), id, dto, actorId);
  }

  @Delete(':id')
  @RequirePermission('pms_properties')
  async remove(@Param('id') id: string, @CurrentAdminId() actorId?: string) {
    return this.properties.remove(await this.tenant.getDefaultTenantId(), id, actorId);
  }
}
