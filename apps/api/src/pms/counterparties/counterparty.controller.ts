import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { CounterpartyService } from './counterparty.service.js';
import { UpsertCounterpartyDto } from './dto/counterparty.dto.js';

/**
 * Контрагенты-покупатели (агентства/компании). Список и создание доступны операторам
 * броней (pms_bookings) — чтобы добавлять прямо из выпадающего списка счёта; правка и
 * удаление — из настроек финансов (pms_finance).
 */
@ApiTags('pms-counterparties')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/finance/counterparties')
export class CounterpartyController {
  constructor(
    private readonly service: CounterpartyService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('pms_bookings')
  async list(@Query('all') all?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return all === 'true' ? this.service.listAll(tenantId) : this.service.list(tenantId);
  }

  @Post()
  @RequirePermission('pms_bookings')
  async create(@Body() dto: UpsertCounterpartyDto, @CurrentAdminId() adminId: string) {
    return this.service.create(await this.tenant.getDefaultTenantId(), dto, adminId);
  }

  @Patch(':id')
  @RequirePermission('pms_finance')
  async update(@Param('id') id: string, @Body() dto: UpsertCounterpartyDto, @CurrentAdminId() adminId: string) {
    return this.service.update(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Delete(':id')
  @RequirePermission('pms_finance')
  async remove(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.service.remove(await this.tenant.getDefaultTenantId(), id, adminId);
  }
}
