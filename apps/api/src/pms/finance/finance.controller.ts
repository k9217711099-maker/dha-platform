import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { FinanceService } from './finance.service.js';
import { SaveBspbConfigDto, SavePaykeeperConfigDto, TestBspbConnectionDto, TestPaykeeperConnectionDto, ToggleIntegrationDto, UpsertLegalEntityDto } from './dto/legal-entity.dto.js';

/** Финансы гостиницы (реквизиты, приём оплаты, фискализация, 1С). RBAC — pms_finance. */
@ApiTags('pms-finance')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly tenant: TenantService,
  ) {}

  // ─── Реквизиты ───
  @Get('legal-entities')
  @RequirePermission('pms_finance')
  async listLegalEntities() {
    return this.finance.listLegalEntities(await this.tenant.getDefaultTenantId());
  }

  @Post('legal-entities')
  @RequirePermission('pms_finance')
  async createLegalEntity(@Body() dto: UpsertLegalEntityDto, @CurrentAdminId() adminId: string) {
    return this.finance.createLegalEntity(await this.tenant.getDefaultTenantId(), dto, adminId);
  }

  @Patch('legal-entities/:id')
  @RequirePermission('pms_finance')
  async updateLegalEntity(@Param('id') id: string, @Body() dto: UpsertLegalEntityDto, @CurrentAdminId() adminId: string) {
    return this.finance.updateLegalEntity(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Delete('legal-entities/:id')
  @RequirePermission('pms_finance')
  async deleteLegalEntity(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.finance.deleteLegalEntity(await this.tenant.getDefaultTenantId(), id, adminId);
  }

  // ─── Интеграции ───
  @Get('integrations')
  @RequirePermission('pms_finance')
  async integrations() {
    return this.finance.listIntegrations();
  }

  @Patch('integrations/:id')
  @RequirePermission('pms_finance')
  async toggleIntegration(@Param('id') id: string, @Body() dto: ToggleIntegrationDto, @CurrentAdminId() adminId: string) {
    return this.finance.toggleIntegration(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  // ─── Эквайринг БСПБ (подключение + способы оплаты) ───
  @Get('bspb')
  @RequirePermission('pms_finance')
  bspbConfig() {
    return this.finance.getBspbConfig();
  }

  @Put('bspb')
  @RequirePermission('pms_finance')
  async saveBspbConfig(@Body() dto: SaveBspbConfigDto, @CurrentAdminId() adminId: string) {
    return this.finance.saveBspbConfig(await this.tenant.getDefaultTenantId(), dto, adminId);
  }

  @Post('bspb/test')
  @HttpCode(200)
  @RequirePermission('pms_finance')
  testBspb(@Body() dto: TestBspbConnectionDto) {
    return this.finance.testBspbConnection(dto);
  }

  // ─── Эквайринг PayKeeper (подключение + способы оплаты) ───
  @Get('paykeeper')
  @RequirePermission('pms_finance')
  paykeeperConfig() {
    return this.finance.getPaykeeperConfig();
  }

  @Put('paykeeper')
  @RequirePermission('pms_finance')
  async savePaykeeperConfig(@Body() dto: SavePaykeeperConfigDto, @CurrentAdminId() adminId: string) {
    return this.finance.savePaykeeperConfig(await this.tenant.getDefaultTenantId(), dto, adminId);
  }

  @Post('paykeeper/test')
  @HttpCode(200)
  @RequirePermission('pms_finance')
  testPaykeeper(@Body() dto: TestPaykeeperConnectionDto) {
    return this.finance.testPaykeeperConnection(dto);
  }

  /** Доступные платёжные системы для онлайн-ссылки (вкладка «Счёт»). Доступно операторам броней. */
  @Get('payment-systems')
  @RequirePermission('pms_bookings')
  paymentSystems() {
    return this.finance.listPaymentSystems();
  }

  // ─── Фискализация ───
  @Get('fiscal')
  @RequirePermission('pms_finance')
  fiscal() {
    return this.finance.getFiscalStatus();
  }

  // ─── Журнал ───
  @Get('audit')
  @RequirePermission('pms_finance')
  async audit(@Query('take') take?: string) {
    return this.finance.auditJournal(take ? Number(take) : 100);
  }
}
