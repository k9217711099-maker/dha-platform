import {
  BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { OpsTaskKind, OpsTaskStatus, WhDocType, WhWriteOffReason } from '@prisma/client';
import type { Response } from 'express';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { UploadsService } from '../pms/uploads/uploads.service.js';
import { DocumentsService } from '../warehouse/documents/documents.service.js';
import { PostingService } from '../warehouse/documents/posting.service.js';
import { OpsReportsService } from './ops-reports.service.js';
import { OpsTaskService, type OpsViewer } from './ops-task.service.js';
import { AnswerChecklistDto, ChangeStatusDto, CommentDto, CreateOpsTaskDto, DelegateDto, UpdateOpsTaskDto, WriteoffDto } from './dto/ops.dto.js';

const viewer = (req: AdminRequest): OpsViewer => ({ id: req.adminId, roleKey: req.adminRoleKey, perms: req.adminPerms });

/** Задачи и уборки (TASKS-HOUSEKEEPING-TZ §12.2). Базовое право — ops_tasks. */
@ApiTags('ops-tasks')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@RequirePermission('ops_tasks')
@Controller('v1/ops/tasks')
export class OpsTasksController {
  constructor(
    private readonly tasks: OpsTaskService,
    private readonly reports: OpsReportsService,
    private readonly tenant: TenantService,
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
    private readonly whDocs: DocumentsService,
    private readonly whPosting: PostingService,
  ) {}

  @Get()
  async list(
    @Req() req: AdminRequest,
    @Query('kind') kind?: OpsTaskKind,
    @Query('status') status?: OpsTaskStatus,
    @Query('statuses') statuses?: string,
    @Query('propertyId') propertyId?: string,
    @Query('roomId') roomId?: string,
    @Query('zoneId') zoneId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('groupId') groupId?: string,
    @Query('createdBy') createdBy?: string,
    @Query('tagId') tagId?: string,
    @Query('tagIds') tagIds?: string,
    @Query('important') important?: string,
    @Query('overdue') overdue?: string,
    @Query('target') target?: string,
    @Query('recurring') recurring?: string,
    @Query('withChecklist') withChecklist?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.tasks.list(await this.tenant.getDefaultTenantId(), viewer(req), {
      kind, status, statuses: statuses ? (statuses.split(',').filter(Boolean) as OpsTaskStatus[]) : undefined,
      propertyId, roomId, zoneId, assigneeId, groupId, createdBy, tagId, q, from, to,
      tagIds: tagIds ? tagIds.split(',').filter(Boolean) : undefined,
      target: target === 'ADMIN' || target === 'LOCATED' ? target : undefined,
      important: important === '1', overdue: overdue === '1', recurring: recurring === '1', withChecklist: withChecklist === '1',
    });
  }

  @Get('export.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(@Req() req: AdminRequest, @Res() res: Response, @Query('kind') kind?: OpsTaskKind, @Query('from') from?: string, @Query('to') to?: string, @Query('propertyId') propertyId?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    // Лимит месяца (§4.2): без периода — последние 31 день; больше — раздел «Отчёты».
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 31 * 86_400_000);
    if (toDate.getTime() - fromDate.getTime() > 31 * 86_400_000) {
      throw new BadRequestException('Экспорт списка — максимум 1 месяц; длиннее — в разделе «Отчёты»');
    }
    const rows = await this.tasks.list(tenantId, viewer(req), { kind, from: fromDate.toISOString(), to: toDate.toISOString(), propertyId });
    const buf = await this.reports.listExport(tenantId, rows);
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.xlsx"');
    res.end(buf);
  }

  @Get('claimable')
  async claimable(@Req() req: AdminRequest) {
    return this.tasks.claimable(await this.tenant.getDefaultTenantId(), viewer(req));
  }

  /** Счётчик для сайдбара (§4). */
  @Get('badge')
  async badge(@Req() req: AdminRequest) {
    return this.tasks.myBadge(await this.tenant.getDefaultTenantId(), viewer(req));
  }

  /** Все задачи/уборки номера (§16, карточка номера на шахматке). */
  @Get('by-room/:roomId')
  async byRoom(@Param('roomId') roomId: string) {
    return this.tasks.byRoom(await this.tenant.getDefaultTenantId(), roomId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.tasks.get(await this.tenant.getDefaultTenantId(), id, req.adminPerms.includes('ops_guest_info'));
  }

  @Post()
  @RequirePermission('ops_create')
  async create(@Body() dto: CreateOpsTaskDto, @Req() req: AdminRequest) {
    return this.tasks.create(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateOpsTaskDto, @Req() req: AdminRequest) {
    return this.tasks.update(await this.tenant.getDefaultTenantId(), id, dto, viewer(req));
  }

  @Delete(':id')
  @RequirePermission('ops_manage')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    await this.tasks.remove(await this.tenant.getDefaultTenantId(), id, viewer(req));
    return { ok: true };
  }

  @Post(':id/status')
  async status(@Param('id') id: string, @Body() dto: ChangeStatusDto, @Req() req: AdminRequest) {
    return this.tasks.changeStatus(await this.tenant.getDefaultTenantId(), id, dto, viewer(req));
  }

  /** Отметить задачу прочитанной (сбрасывает счётчик непрочитанных в колонке «Активность»). */
  @Post(':id/read')
  async read(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.tasks.markRead(await this.tenant.getDefaultTenantId(), id, viewer(req));
  }

  /** Забрать свободную задачу своего отдела себе (§7-E). */
  @Post(':id/claim')
  async claim(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.tasks.claim(await this.tenant.getDefaultTenantId(), id, viewer(req));
  }

  /** Делегировать задачу другому исполнителю/отделу (§4.4). */
  @Post(':id/delegate')
  async delegate(@Param('id') id: string, @Body() dto: DelegateDto, @Req() req: AdminRequest) {
    return this.tasks.delegate(await this.tenant.getDefaultTenantId(), id, dto, viewer(req));
  }

  @Post(':id/inspect')
  @RequirePermission('ops_inspect')
  async inspect(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.tasks.inspect(await this.tenant.getDefaultTenantId(), id, viewer(req));
  }

  @Post(':id/comments')
  async comment(@Param('id') id: string, @Body() dto: CommentDto, @Req() req: AdminRequest) {
    return this.tasks.comment(await this.tenant.getDefaultTenantId(), id, dto.body, viewer(req));
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async attach(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: AdminRequest) {
    const saved = await this.uploads.saveAttachment(file);
    return this.tasks.attach(await this.tenant.getDefaultTenantId(), id, saved.url, saved.name, viewer(req));
  }

  @Post(':id/checklists/:clId/answers/:itemId')
  async answer(@Param('id') id: string, @Param('clId') clId: string, @Param('itemId') itemId: string, @Body() dto: AnswerChecklistDto, @Req() req: AdminRequest) {
    return this.tasks.answerChecklist(await this.tenant.getDefaultTenantId(), id, clId, itemId, dto.answer, dto.comment, viewer(req));
  }

  /** Фото-подтверждение пункта (§5.3): сохраняет файл и пишет photoUrl в ответ. */
  @Post(':id/checklists/:clId/answers/:itemId/photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async answerPhoto(@Param('id') id: string, @Param('clId') clId: string, @Param('itemId') itemId: string, @UploadedFile() file: Express.Multer.File, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const saved = await this.uploads.saveImage(file);
    const existing = await this.prisma.opsChecklistAnswer.findUnique({ where: { taskChecklistId_itemId: { taskChecklistId: clId, itemId } } });
    const answer = await this.tasks.answerChecklist(tenantId, id, clId, itemId, existing?.answer ?? 'YES', existing?.comment ?? undefined, viewer(req), saved.url);
    await this.tasks.attach(tenantId, id, saved.url, saved.name, viewer(req), answer.id);
    return answer;
  }

  @Post(':id/checklists/:clId/autocomplete')
  async autocomplete(@Param('id') id: string, @Param('clId') clId: string, @Req() req: AdminRequest) {
    return this.tasks.autocompleteChecklist(await this.tenant.getDefaultTenantId(), id, clId, viewer(req));
  }

  @Post(':id/checklists/:clId/items/:itemId/task')
  @RequirePermission('ops_create')
  async taskFromItem(@Param('id') id: string, @Param('clId') clId: string, @Param('itemId') itemId: string, @Body() body: { assigneeIds?: string[] }, @Req() req: AdminRequest) {
    return this.tasks.taskFromChecklistItem(await this.tenant.getDefaultTenantId(), id, clId, itemId, viewer(req), body.assigneeIds);
  }

  /** Списание расходников при уборке (§6.6): складской документ WRITE_OFF + проводка. */
  @Post(':id/writeoff')
  async writeoff(@Param('id') id: string, @Body() dto: WriteoffDto & { warehouseId: string }, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const task = await this.tasks.getRaw(tenantId, id);
    const doc = await this.whDocs.create({
      type: 'WRITE_OFF' as WhDocType,
      fromWarehouseId: dto.warehouseId,
      reason: 'USED' as WhWriteOffReason,
      comment: `Расходники по задаче «${task.title}»${task.roomId ? '' : ''}`,
      lines: dto.items.map((l) => ({ itemId: l.itemId, quantity: l.qty })),
    } as Parameters<DocumentsService['create']>[0], req.adminId);
    await this.prisma.whDocument.update({ where: { id: doc.id }, data: { opsTaskId: id } });
    // Проводим сразу; крупные суммы остаются на согласовании (правила склада §17.7).
    if (doc.status === 'DRAFT') await this.whPosting.post(doc.id, req.adminId);
    return this.prisma.whDocument.findUnique({ where: { id: doc.id }, select: { id: true, number: true, status: true } });
  }
}
