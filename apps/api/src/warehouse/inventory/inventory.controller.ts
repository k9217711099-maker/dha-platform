import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId, CurrentAdminPerms } from '../../admin/current-admin.decorator.js';
import { InventoryService } from './inventory.service.js';
import { StartInventoryDto, UpdateInventoryFactsDto } from '../dto/warehouse.dto.js';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('inventories')
  @RequirePermission('wh_inventory')
  list() {
    return this.inventory.list();
  }

  @Get('inventories/:id')
  @RequirePermission('wh_inventory')
  get(@Param('id') id: string) {
    return this.inventory.get(id);
  }

  @Post('inventories')
  @RequirePermission('wh_inventory')
  @ApiOperation({ summary: 'Начать инвентаризацию: снимок учётного остатка (§5.6)' })
  start(@Body() dto: StartInventoryDto, @CurrentAdminId() adminId: string) {
    return this.inventory.start(dto, adminId);
  }

  @Patch('inventories/:id/facts')
  @RequirePermission('wh_inventory')
  @ApiOperation({ summary: 'Ввести фактические остатки' })
  updateFacts(@Param('id') id: string, @Body() dto: UpdateInventoryFactsDto) {
    return this.inventory.updateFacts(id, dto.lines);
  }

  @Post('inventories/:id/submit')
  @RequirePermission('wh_inventory')
  @ApiOperation({ summary: 'Отправить на согласование (недостачи требуют причину)' })
  submit(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.inventory.submit(id, adminId);
  }

  @Post('inventories/:id/approve')
  @RequirePermission('wh_inventory')
  @ApiOperation({ summary: 'Утвердить и создать корректировки (крупное расхождение — право руководителя)' })
  approve(@Param('id') id: string, @CurrentAdminId() adminId: string, @CurrentAdminPerms() perms: string[]) {
    return this.inventory.approve(id, adminId, perms);
  }

  @Post('inventories/:id/cancel')
  @RequirePermission('wh_inventory')
  cancel(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.inventory.cancel(id, adminId);
  }
}
