import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WhDocStatus, WhDocType } from '@prisma/client';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { DocumentsService } from './documents.service.js';
import { PostingService } from './posting.service.js';
import { CreateDocumentDto, ReceiveDto } from '../dto/warehouse.dto.js';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('warehouse')
export class WarehouseDocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly posting: PostingService,
  ) {}

  @Get('documents')
  @RequirePermission('wh_documents')
  list(@Query('type') type?: WhDocType, @Query('status') status?: WhDocStatus) {
    return this.docs.list({ type, status });
  }

  @Get('documents/:id')
  @RequirePermission('wh_documents')
  get(@Param('id') id: string) {
    return this.docs.get(id);
  }

  @Post('documents')
  @RequirePermission('wh_documents')
  @ApiOperation({ summary: 'Создать документ (на этом этапе — приход)' })
  create(@Body() dto: CreateDocumentDto, @CurrentAdminId() adminId: string) {
    return this.docs.create(dto, adminId);
  }

  @Post('documents/:id/post')
  @RequirePermission('wh_documents')
  @ApiOperation({ summary: 'Провести документ: движения + остатки (§14). Приход и списание.' })
  post(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.posting.post(id, adminId);
  }

  @Post('documents/:id/approve')
  @RequirePermission('wh_approve_writeoff')
  @ApiOperation({ summary: 'Согласовать крупное списание (§17.7)' })
  approve(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.posting.approve(id, adminId);
  }

  @Post('documents/:id/ship')
  @RequirePermission('wh_documents')
  @ApiOperation({ summary: 'Отгрузить перемещение: списать с отправителя, статус «в пути» (§5.3)' })
  ship(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.posting.ship(id, adminId);
  }

  @Post('documents/:id/receive')
  @RequirePermission('wh_documents')
  @ApiOperation({ summary: 'Подтвердить получение перемещения по факту + акт расхождения (§5.3)' })
  receive(@Param('id') id: string, @Body() dto: ReceiveDto, @CurrentAdminId() adminId: string) {
    return this.posting.receive(id, dto.lines ?? [], adminId);
  }

  @Post('documents/:id/cancel')
  @RequirePermission('wh_documents')
  @ApiOperation({ summary: 'Отменить документ (реверс для проведённого)' })
  cancel(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.posting.cancel(id, adminId);
  }
}
