import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WhRequestStatus } from '@prisma/client';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { RequestsService } from './requests.service.js';
import { CreateRequestDto, RejectRequestDto } from '../dto/warehouse.dto.js';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('requests/recommendations')
  @RequirePermission('wh_requests')
  @ApiOperation({ summary: 'Рекомендация к пополнению адреса (par stock − остаток, §5.7)' })
  recommendations(@Query('addressId') addressId: string) {
    return this.requests.recommendations(addressId);
  }

  @Get('requests')
  @RequirePermission('wh_requests')
  list(@Query('status') status?: WhRequestStatus, @Query('addressId') addressId?: string) {
    return this.requests.list({ status, addressId });
  }

  @Get('requests/:id')
  @RequirePermission('wh_requests')
  get(@Param('id') id: string) {
    return this.requests.get(id);
  }

  @Post('requests')
  @RequirePermission('wh_requests')
  create(@Body() dto: CreateRequestDto, @CurrentAdminId() adminId: string) {
    return this.requests.create(dto, adminId);
  }

  // Согласование и формирование перемещения — действия центральных ролей (право wh_documents).
  @Post('requests/:id/approve')
  @RequirePermission('wh_documents')
  approve(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.requests.approve(id, adminId);
  }

  @Post('requests/:id/reject')
  @RequirePermission('wh_documents')
  reject(@Param('id') id: string, @Body() dto: RejectRequestDto, @CurrentAdminId() adminId: string) {
    return this.requests.reject(id, dto.reason, adminId);
  }

  @Post('requests/:id/create-transfer')
  @RequirePermission('wh_documents')
  @ApiOperation({ summary: 'Создать перемещение ЦС → адрес по согласованной заявке' })
  createTransfer(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.requests.createTransfer(id, adminId);
  }
}
