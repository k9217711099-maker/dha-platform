import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { ReportsService } from './reports.service.js';
import { ExcelService, type ExcelColumn } from '../excel/excel.service.js';
import { CreateNormDto, UpdateNormDto } from '../dto/warehouse.dto.js';

const REPORT_COLUMNS: Record<string, ExcelColumn[]> = {
  'stock-value': [{ key: 'name', label: 'Склад' }, { key: 'positions', label: 'Позиций' }, { key: 'value', label: 'Стоимость' }],
  movements: [{ key: 'date', label: 'Дата' }, { key: 'documentType', label: 'Тип' }, { key: 'itemName', label: 'Позиция' }, { key: 'quantityIn', label: 'Приход' }, { key: 'quantityOut', label: 'Расход' }, { key: 'amount', label: 'Сумма' }],
  consumption: [{ key: 'label', label: 'Группа' }, { key: 'quantity', label: 'Кол-во' }, { key: 'amount', label: 'Сумма' }],
  losses: [{ key: 'reason', label: 'Причина' }, { key: 'count', label: 'Документов' }, { key: 'amount', label: 'Сумма' }],
  'low-stock': [{ key: 'name', label: 'Позиция' }, { key: 'quantity', label: 'Остаток' }, { key: 'minStock', label: 'Минимум' }, { key: 'unit', label: 'Ед.' }],
  expiry: [{ key: 'itemName', label: 'Позиция' }, { key: 'warehouseName', label: 'Склад' }, { key: 'expiryDate', label: 'Срок' }, { key: 'daysLeft', label: 'Дней' }, { key: 'quantity', label: 'Кол-во' }],
  requests: [{ key: 'number', label: 'Заявка' }, { key: 'status', label: 'Статус' }, { key: 'createdAt', label: 'Создана' }, { key: 'processingHours', label: 'Часов до согл.' }],
  'inventory-diffs': [{ key: 'inventory', label: 'Инвент.' }, { key: 'itemName', label: 'Позиция' }, { key: 'book', label: 'Учёт' }, { key: 'fact', label: 'Факт' }, { key: 'deviation', label: 'Откл.' }, { key: 'deviationMoney', label: 'Сумма' }],
};

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly excel: ExcelService,
  ) {}

  /** Период отчёта: по умолчанию последние 30 дней. */
  private period(from?: string, to?: string): { f: Date; t: Date } {
    const t = to ? new Date(to) : new Date();
    const f = from ? new Date(from) : new Date(t.getTime() - 30 * 86400000);
    return { f, t };
  }

  @Get('norms')
  @RequirePermission('wh_reports')
  norms() {
    return this.reports.norms();
  }

  @Post('norms')
  @RequirePermission('wh_reports')
  createNorm(@Body() dto: CreateNormDto) {
    return this.reports.createNorm(dto);
  }

  @Patch('norms/:id')
  @RequirePermission('wh_reports')
  updateNorm(@Param('id') id: string, @Body() dto: UpdateNormDto) {
    return this.reports.updateNorm(id, dto);
  }

  @Delete('norms/:id')
  @RequirePermission('wh_reports')
  deleteNorm(@Param('id') id: string) {
    return this.reports.deleteNorm(id);
  }

  // ─── Отчёты §6.7 ───
  @Get('reports/stock-value')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Стоимость запасов по складам (§6.7.12)' })
  stockValue() {
    return this.reports.stockValue();
  }

  @Get('reports/movements')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Движение товара за период (§6.7.2)' })
  movements(@Query('from') from?: string, @Query('to') to?: string, @Query('warehouseId') warehouseId?: string, @Query('itemId') itemId?: string) {
    const { f, t } = this.period(from, to);
    return this.reports.movements({ from: f, to: t, warehouseId, itemId });
  }

  @Get('reports/consumption')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Расход по адресам / категориям / номенклатуре (§6.7.3-5)' })
  consumption(@Query('groupBy') groupBy?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = this.period(from, to);
    const g = groupBy === 'category' || groupBy === 'item' ? groupBy : 'address';
    return this.reports.consumption({ from: f, to: t, groupBy: g });
  }

  @Get('reports/losses')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Потери и списания по причинам (§6.7.10)' })
  losses(@Query('from') from?: string, @Query('to') to?: string) {
    const { f, t } = this.period(from, to);
    return this.reports.losses({ from: f, to: t });
  }

  @Get('reports/low-stock')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Товары ниже минимального остатка (§6.7.6)' })
  lowStock() {
    return this.reports.lowStock();
  }

  @Get('reports/expiry')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Истекающий срок и просроченные (§6.7.7-8)' })
  expiry(@Query('days') days?: string) {
    return this.reports.expiry(Number(days) || 30);
  }

  @Get('reports/requests')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Заявки и скорость обработки (§6.7.13)' })
  requestsReport() {
    return this.reports.requestsReport();
  }

  @Get('reports/inventory-diffs')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Инвентаризационные расхождения (§6.7.9)' })
  inventoryDiffs() {
    return this.reports.inventoryDiffs();
  }

  @Get('reports/:report/export')
  @RequirePermission('wh_reports')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="report.xlsx"')
  @ApiOperation({ summary: 'Экспорт отчёта в Excel (§18)' })
  async exportReport(
    @Param('report') report: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
    @Query('days') days?: string,
  ): Promise<StreamableFile> {
    const cols = REPORT_COLUMNS[report];
    if (!cols) throw new BadRequestException('Неизвестный отчёт');
    const { f, t } = this.period(from, to);
    let rows: Record<string, unknown>[];
    switch (report) {
      case 'stock-value': rows = await this.reports.stockValue(); break;
      case 'movements': rows = await this.reports.movements({ from: f, to: t }); break;
      case 'consumption': rows = await this.reports.consumption({ from: f, to: t, groupBy: groupBy === 'category' || groupBy === 'item' ? groupBy : 'address' }); break;
      case 'losses': rows = await this.reports.losses({ from: f, to: t }); break;
      case 'low-stock': rows = await this.reports.lowStock(); break;
      case 'expiry': rows = await this.reports.expiry(Number(days) || 30); break;
      case 'requests': rows = await this.reports.requestsReport(); break;
      case 'inventory-diffs': rows = await this.reports.inventoryDiffs(); break;
      default: throw new BadRequestException('Неизвестный отчёт');
    }
    return new StreamableFile(this.excel.build(report, cols, rows));
  }

  @Get('reports/overspend')
  @RequirePermission('wh_reports')
  @ApiOperation({ summary: 'Перерасход по адресу относительно нормы (§6.7.14)' })
  overspend(
    @Query('addressId') addressId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('roomNights') roomNights?: string,
    @Query('stays') stays?: string,
    @Query('guests') guests?: string,
    @Query('cleanings') cleanings?: string,
  ) {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    return this.reports.overspend({
      addressId,
      from: from ? new Date(from) : monthAgo,
      to: to ? new Date(to) : now,
      roomNights: Number(roomNights) || 0,
      stays: Number(stays) || 0,
      guests: Number(guests) || 0,
      cleanings: Number(cleanings) || 0,
    });
  }
}
