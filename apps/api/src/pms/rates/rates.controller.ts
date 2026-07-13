import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { RateService } from './rate.service.js';
import { BulkPricesDto, BulkRestrictionsDto, CalendarQueryDto, QuoteQueryDto, SetPricesDto, SetRestrictionsDto } from './dto/rate.dto.js';

/**
 * Rate Engine (DHP §22). Маршруты `/api/v1/rates/*`.
 * `quote` — операция бронирования (RBAC pms_bookings); управление ценами/ограничениями/
 * календарём — RBAC pms_rates (revenue-контур).
 */
@ApiTags('pms-rates')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/rates')
export class RatesController {
  constructor(
    private readonly rates: RateService,
    private readonly tenant: TenantService,
  ) {}

  @Get('quote')
  @RequirePermission('pms_bookings')
  async quote(@Query() query: QuoteQueryDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.quote(tenantId, query);
  }

  @Get('calendar')
  @RequirePermission('pms_rates')
  async calendar(@Query() query: CalendarQueryDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.calendar(tenantId, query);
  }

  @Put('prices')
  @RequirePermission('pms_rates')
  async setPrices(@Body() dto: SetPricesDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.setPrices(tenantId, dto, adminId);
  }

  @Put('prices/bulk')
  @RequirePermission('pms_rates')
  async bulkPrices(@Body() dto: BulkPricesDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.bulkPrices(tenantId, dto, adminId);
  }

  @Put('restrictions')
  @RequirePermission('pms_rates')
  async setRestrictions(@Body() dto: SetRestrictionsDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.setRestrictions(tenantId, dto, adminId);
  }

  @Put('restrictions/bulk')
  @RequirePermission('pms_rates')
  async bulkRestrictions(@Body() dto: BulkRestrictionsDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.bulkRestrictions(tenantId, dto, adminId);
  }

  @Get('restrictions/grid')
  @RequirePermission('pms_rates')
  async grid(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('propertyId') propertyId?: string,
    @Query('ratePlanId') ratePlanId?: string,
    @Query('roomTypeId') roomTypeId?: string,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.rates.restrictionsGrid(tenantId, { propertyId, from, to, ratePlanId, roomTypeId });
  }
}
