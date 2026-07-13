import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto, UpdateSupplierDto } from '../dto/warehouse.dto.js';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseSuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get('suppliers')
  @RequirePermission('wh_dashboard')
  list() {
    return this.suppliers.list();
  }

  @Post('suppliers')
  @RequirePermission('wh_suppliers')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Patch('suppliers/:id')
  @RequirePermission('wh_suppliers')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }
}
