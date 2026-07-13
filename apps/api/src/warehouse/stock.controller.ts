import { Controller, Get, Header, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { CurrentAdminId, CurrentAdminPerms } from '../admin/current-admin.decorator.js';
import { BalancesService } from './documents/balances.service.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { AuditService } from './audit/audit.service.js';
import { ExcelService, type ExcelColumn } from './excel/excel.service.js';
import { WAREHOUSE_META } from './meta.js';
import { WRITE_OFF_APPROVAL_LIMIT } from './constants.js';

const BALANCE_EXPORT_COLUMNS: ExcelColumn[] = [
  { key: 'warehouseName', label: 'Склад' },
  { key: 'addressName', label: 'Адрес' },
  { key: 'itemName', label: 'Позиция' },
  { key: 'sku', label: 'Артикул' },
  { key: 'unit', label: 'Ед.' },
  { key: 'category', label: 'Категория' },
  { key: 'batch', label: 'Партия' },
  { key: 'expiryDate', label: 'Срок' },
  { key: 'quantity', label: 'Остаток' },
  { key: 'available', label: 'Доступно' },
  { key: 'minStock', label: 'Минимум' },
  { key: 'avgCost', label: 'Себестоимость' },
  { key: 'amount', label: 'Сумма' },
];

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseStockController {
  constructor(
    private readonly balances: BalancesService,
    private readonly dashboard: DashboardService,
    private readonly audit: AuditService,
    private readonly excel: ExcelService,
  ) {}

  @Get('balances')
  @RequirePermission('wh_balances')
  @ApiOperation({ summary: 'Остатки по складам/адресам (§6.3)' })
  listBalances(
    @CurrentAdminId() adminId: string,
    @CurrentAdminPerms() perms: string[],
    @Query('warehouseId') warehouseId?: string,
    @Query('addressId') addressId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('zero') zero?: string,
    @Query('belowMin') belowMin?: string,
    @Query('expiringDays') expiringDays?: string,
  ) {
    return this.balances.list(
      {
        warehouseId,
        addressId,
        categoryId,
        q,
        zero: zero === '1',
        belowMin: belowMin === '1',
        expiringDays: expiringDays ? Number(expiringDays) : undefined,
      },
      adminId,
      perms.includes('wh_costs'),
    );
  }

  @Get('balances/export')
  @RequirePermission('wh_balances')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="balances.xlsx"')
  async exportBalances(@CurrentAdminId() adminId: string, @CurrentAdminPerms() perms: string[]): Promise<StreamableFile> {
    const rows = await this.balances.list({}, adminId, perms.includes('wh_costs'));
    return new StreamableFile(this.excel.build('Остатки', BALANCE_EXPORT_COLUMNS, rows as unknown as Record<string, unknown>[]));
  }

  @Get('dashboard')
  @RequirePermission('wh_dashboard')
  @ApiOperation({ summary: 'Главная панель склада (§6.1)' })
  dashboardSummary(@CurrentAdminId() adminId: string, @CurrentAdminPerms() perms: string[]) {
    return this.dashboard.summary(adminId, perms.includes('wh_costs'));
  }

  @Get('meta')
  @RequirePermission('wh_dashboard')
  meta() {
    return { ...WAREHOUSE_META, writeOffApprovalLimit: WRITE_OFF_APPROVAL_LIMIT };
  }

  @Get('audit')
  @RequirePermission('wh_documents')
  auditLog(@Query('entityId') entityId?: string) {
    return this.audit.list({ entityId, take: 100 });
  }
}
