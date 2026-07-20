import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AiChannel, AiConversationStatus } from '@prisma/client';
import { AdminAuthGuard, type AdminRequest } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { OperatorInboxService } from './operator-inbox.service.js';
import { InboxReplyDto } from './dto/inbox-reply.dto.js';
import { InboxDelegateDto } from './dto/inbox-delegate.dto.js';
import { InboxRenameDto } from './dto/inbox-rename.dto.js';
import { InboxTemplatesDto } from './dto/inbox-templates.dto.js';

/** Лента эскалаций для оператора (админ-панель, право guest_inbox). */
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/inbox')
@UseGuards(AdminAuthGuard)
@RequirePermission('guest_inbox')
export class OperatorInboxController {
  constructor(
    private readonly inbox: OperatorInboxService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Очередь эскалированных диалогов' })
  async list() {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.inbox.list(tenantId);
  }

  @Get('operators')
  @ApiOperation({ summary: 'Сотрудники — цели делегирования (§4.8)' })
  async operators() {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.inbox.operators(tenantId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Число непрочитанных эскалаций (бейдж сайдбара, #1)' })
  async unreadCount() {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.inbox.unreadCount(tenantId);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Быстрые шаблоны ответа («/», #5)' })
  templates() {
    return this.inbox.getTemplates();
  }

  @Put('templates')
  @ApiOperation({ summary: 'Сохранить быстрые шаблоны ответа (полная замена)' })
  saveTemplates(@Body() dto: InboxTemplatesDto) {
    return this.inbox.setTemplates(dto.templates);
  }

  @Get('all')
  @ApiOperation({ summary: 'Все гостевые диалоги (мониторинг), не только эскалированные' })
  @ApiQuery({ name: 'status', required: false, enum: AiConversationStatus })
  @ApiQuery({ name: 'channel', required: false, enum: AiChannel })
  async all(
    @Query('status') status?: AiConversationStatus,
    @Query('channel') channel?: AiChannel,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.inbox.listAll(tenantId, {
      status: status && status in AiConversationStatus ? status : undefined,
      channel: channel && channel in AiChannel ? channel : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Диалог с историей' })
  thread(@Param('id') id: string) {
    return this.inbox.thread(id);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Взять диалог на себя' })
  assign(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.inbox.assign(id, req.adminId);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Ответить гостю (уходит в его канал)' })
  reply(@Param('id') id: string, @Body() dto: InboxReplyDto, @Req() req: AdminRequest) {
    return this.inbox.reply(id, req.adminId, dto.text);
  }

  @Post(':id/attachment')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ответить гостю файлом/фото (≤ 25 МБ, #5/#10)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  attachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AdminRequest,
    @Body('text') text?: string,
  ) {
    return this.inbox.replyAttachment(id, req.adminId, file, text);
  }

  @Post(':id/rename')
  @ApiOperation({ summary: 'Переименовать диалог (#7)' })
  rename(@Param('id') id: string, @Body() dto: InboxRenameDto) {
    return this.inbox.rename(id, dto.title ?? null);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Закрыть диалог' })
  close(@Param('id') id: string) {
    return this.inbox.close(id);
  }

  @Post(':id/delegate')
  @ApiOperation({ summary: 'Передать диалог другому сотруднику (§4.8)' })
  delegate(@Param('id') id: string, @Body() dto: InboxDelegateDto, @Req() req: AdminRequest) {
    return this.inbox.delegate(id, req.adminId, dto.operatorId, dto.note);
  }
}
