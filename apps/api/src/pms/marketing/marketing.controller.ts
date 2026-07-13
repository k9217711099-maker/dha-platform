import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MarketingOptionKind } from '@prisma/client';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { MarketingService } from './marketing.service.js';
import { CreateMarketingOptionDto, UpdateMarketingOptionDto } from './dto/marketing.dto.js';

/** Маркетинговые словари. `/api/v1/marketing-options`, RBAC pms_marketing. */
@ApiTags('pms-marketing')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/marketing-options')
export class MarketingController {
  constructor(
    private readonly marketing: MarketingService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_marketing')
  async list(@Query('kind') kind?: MarketingOptionKind) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.marketing.list(tenantId, kind);
  }

  @Post()
  @RequirePermission('pms_marketing')
  async create(@Body() dto: CreateMarketingOptionDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.marketing.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('pms_marketing')
  async update(@Param('id') id: string, @Body() dto: UpdateMarketingOptionDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.marketing.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('pms_marketing')
  async remove(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.marketing.remove(tenantId, id);
  }
}
