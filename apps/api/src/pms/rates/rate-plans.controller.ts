import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { RateService } from './rate.service.js';
import { CreateRatePlanDto, UpdateRatePlanDto } from './dto/rate.dto.js';

/** Тарифные планы (DHP Rates §3). Маршруты `/api/v1/rate-plans`. RBAC — pms_rates. */
@ApiTags('pms-rates')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/rate-plans')
export class RatePlansController {
  constructor(
    private readonly rates: RateService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_rates')
  async list(@Query('propertyId') propertyId?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.listPlans(tenantId, propertyId);
  }

  @Get(':id')
  @RequirePermission('pms_rates')
  async get(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.getPlan(tenantId, id);
  }

  @Post()
  @RequirePermission('pms_rates')
  async create(@Body() dto: CreateRatePlanDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.createPlan(tenantId, dto, adminId);
  }

  @Patch(':id')
  @RequirePermission('pms_rates')
  async update(@Param('id') id: string, @Body() dto: UpdateRatePlanDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.updatePlan(tenantId, id, dto, adminId);
  }

  @Delete(':id')
  @RequirePermission('pms_rates')
  async remove(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.deletePlan(tenantId, id, adminId);
  }
}
