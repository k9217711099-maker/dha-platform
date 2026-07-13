import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { ItemsService } from './items.service.js';
import { ExcelService, type ExcelColumn } from '../excel/excel.service.js';
import {
  CreateCategoryDto,
  CreateItemDto,
  UpdateCategoryDto,
  UpdateItemDto,
} from '../dto/warehouse.dto.js';

const ITEM_EXPORT_COLUMNS: ExcelColumn[] = [
  { key: 'sku', label: 'Артикул' },
  { key: 'name', label: 'Название' },
  { key: 'category', label: 'Категория' },
  { key: 'unit', label: 'Единица измерения' },
  { key: 'barcode', label: 'Штрихкод' },
  { key: 'minStock', label: 'Минимальный остаток' },
  { key: 'maxStock', label: 'Максимальный остаток' },
  { key: 'parStock', label: 'Par stock' },
  { key: 'lastPurchasePrice', label: 'Цена' },
  { key: 'trackExpiry', label: 'Признак срока годности' },
  { key: 'active', label: 'Активна' },
];

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly excel: ExcelService,
  ) {}

  @Get('categories')
  @RequirePermission('wh_dashboard')
  categories() {
    return this.items.categories();
  }

  @Post('categories')
  @RequirePermission('wh_items')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.items.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermission('wh_items')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.items.updateCategory(id, dto);
  }

  @Get('items')
  @RequirePermission('wh_dashboard')
  list(@Query('categoryId') categoryId?: string, @Query('q') q?: string) {
    return this.items.items({ categoryId, q });
  }

  @Get('items/export')
  @RequirePermission('wh_dashboard')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="items.xlsx"')
  async exportItems(): Promise<StreamableFile> {
    const rows = await this.items.exportRows();
    return new StreamableFile(this.excel.build('Номенклатура', ITEM_EXPORT_COLUMNS, rows));
  }

  @Post('items/import')
  @RequirePermission('wh_items')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  importItems(@UploadedFile() file: Express.Multer.File) {
    return this.items.importItems(this.excel.parse(file.buffer));
  }

  @Get('items/:id')
  @RequirePermission('wh_dashboard')
  item(@Param('id') id: string) {
    return this.items.item(id);
  }

  @Post('items')
  @RequirePermission('wh_items')
  createItem(@Body() dto: CreateItemDto) {
    return this.items.createItem(dto);
  }

  @Patch('items/:id')
  @RequirePermission('wh_items')
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.items.updateItem(id, dto);
  }
}
