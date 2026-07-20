import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AiChannel, AiConversationStatus } from '@prisma/client';
import { AdminAuthGuard, type AdminRequest } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { OperatorInboxService } from './operator-inbox.service.js';
import { InboxReplyDto } from './dto/inbox-reply.dto.js';
import { InboxDelegateDto } from './dto/inbox-delegate.dto.js';
import { InboxRenameDto } from './dto/inbox-rename.dto.js';

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
