import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { FinanceDocService } from './finance-doc.service.js';
import { CreateDepositDto, CreateFinanceDocDto, ResolveDepositDto } from './dto/finance-doc.dto.js';

/** Финансовые документы брони: счета/квитанции/акты + залоги (вкладка «Счёт»). RBAC pms_bookings. */
@ApiTags('pms-finance-docs')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1')
export class FinanceDocController {
  constructor(
    private readonly docs: FinanceDocService,
    private readonly tenant: TenantService,
  ) {}

  @Get('bookings/:id/docs')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Счета/квитанции/акты по брони' })
  async listDocs(@Param('id') id: string) {
    return this.docs.listDocs(await this.tenant.getDefaultTenantId(), id);
  }

  @Post('bookings/:id/docs')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Создать счёт / квитанцию / акт по брони' })
  async createDoc(@Param('id') id: string, @Body() dto: CreateFinanceDocDto, @CurrentAdminId() adminId: string) {
    return this.docs.createDoc(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Post('finance-docs/:docId/cancel')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Аннулировать документ' })
  async cancelDoc(@Param('docId') docId: string, @CurrentAdminId() adminId: string) {
    return this.docs.cancelDoc(await this.tenant.getDefaultTenantId(), docId, adminId);
  }

  @Get('bookings/:id/deposit-default')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Сумма залога по умолчанию (из настроек категории/объекта)' })
  async depositDefault(@Param('id') id: string) {
    return { amount: await this.docs.depositDefault(await this.tenant.getDefaultTenantId(), id) };
  }

  @Get('bookings/:id/deposits')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Залоги по брони' })
  async listDeposits(@Param('id') id: string) {
    return this.docs.listDeposits(await this.tenant.getDefaultTenantId(), id);
  }

  @Post('bookings/:id/deposits')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Создать залог (преавторизация карты или ручной приём)' })
  async createDeposit(@Param('id') id: string, @Body() dto: CreateDepositDto, @CurrentAdminId() adminId: string) {
    return this.docs.createDeposit(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Post('deposits/:depId/resolve')
  @RequirePermission('pms_bookings')
  @ApiOperation({ summary: 'Разрешить залог при выезде: снять / удержать / вернуть' })
  async resolveDeposit(@Param('depId') depId: string, @Body() dto: ResolveDepositDto, @CurrentAdminId() adminId: string) {
    return this.docs.resolveDeposit(await this.tenant.getDefaultTenantId(), depId, dto, adminId);
  }
}
