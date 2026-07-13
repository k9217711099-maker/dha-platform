import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { PromocodeService } from '../../promocodes/promocode.service.js';
import { UpsertPromocodeDto } from './dto/promocode.dto.js';

/** Промокоды в разделе «Тарифы и ограничения» (Путь B). `/api/v1/promocodes`, RBAC pms_rates. */
@ApiTags('pms-rates')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/promocodes')
export class PmsPromocodesController {
  constructor(private readonly promocodes: PromocodeService) {}

  @Get()
  @RequirePermission('pms_rates')
  list() {
    return this.promocodes.list();
  }

  @Post()
  @RequirePermission('pms_rates')
  create(@Body() dto: UpsertPromocodeDto) {
    return this.promocodes.create(dto);
  }

  @Patch(':id')
  @RequirePermission('pms_rates')
  update(@Param('id') id: string, @Body() dto: UpsertPromocodeDto) {
    return this.promocodes.update(id, dto);
  }

  @Put(':id/active')
  @RequirePermission('pms_rates')
  setActive(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.promocodes.setActive(id, body.active);
  }

  @Delete(':id')
  @RequirePermission('pms_rates')
  remove(@Param('id') id: string) {
    return this.promocodes.remove(id);
  }
}
