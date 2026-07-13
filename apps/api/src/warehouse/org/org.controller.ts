import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { OrgService } from './org.service.js';
import {
  CreateAddressDto,
  CreateWarehouseDto,
  UpdateAddressDto,
  UpdateWarehouseDto,
} from '../dto/warehouse.dto.js';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseOrgController {
  constructor(private readonly org: OrgService) {}

  // Чтение справочников доступно всем складским ролям (для селектов); правка — wh_addresses.
  @Get('addresses')
  @RequirePermission('wh_dashboard')
  addresses() {
    return this.org.addresses();
  }

  @Post('addresses')
  @RequirePermission('wh_addresses')
  createAddress(@Body() dto: CreateAddressDto) {
    return this.org.createAddress(dto);
  }

  @Patch('addresses/:id')
  @RequirePermission('wh_addresses')
  updateAddress(@Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.org.updateAddress(id, dto);
  }

  @Get('warehouses')
  @RequirePermission('wh_dashboard')
  warehouses() {
    return this.org.warehouses();
  }

  @Post('warehouses')
  @RequirePermission('wh_addresses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.org.createWarehouse(dto);
  }

  @Patch('warehouses/:id')
  @RequirePermission('wh_addresses')
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.org.updateWarehouse(id, dto);
  }
}
