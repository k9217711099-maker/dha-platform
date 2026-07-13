import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { StaffChatService } from './staff-chat.service.js';
import {
  CreateDmDto,
  CreateGroupDto,
  EditMessageDto,
  FolderCreateDto,
  FolderUpdateDto,
  NotifyDto,
  ReactDto,
  SendMessageDto,
} from './dto/staff-chat.dto.js';

/** Внутренний мессенджер сотрудников (§2). Только админ с правом `staff_chat`. */
@ApiTags('staff-chat')
@ApiBearerAuth()
@Controller('staff-chat')
@UseGuards(AdminAuthGuard)
@RequirePermission('staff_chat')
export class StaffChatController {
  constructor(
    private readonly chat: StaffChatService,
    private readonly tenant: TenantService,
  ) {}

  @Get('colleagues')
  @ApiOperation({ summary: 'Сотрудники для начала чата (+ онлайн)' })
  async colleagues(@Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.chat.colleagues(tenantId, req.adminId);
  }

  @Get('departments')
  @ApiOperation({ summary: 'Отделы с участниками — быстрый чат на весь отдел' })
  async departments(@Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.chat.departments(tenantId, req.adminId);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Всего непрочитанных сообщений (счётчик сайдбара)' })
  async unread(@Req() req: AdminRequest) {
    return this.chat.unreadTotal(await this.tenant.getDefaultTenantId(), req.adminId);
  }

  @Get('search-all')
  @ApiOperation({ summary: 'Поиск по всем моим чатам' })
  async searchAll(@Query('q') q: string, @Req() req: AdminRequest) {
    return this.chat.searchAll(await this.tenant.getDefaultTenantId(), req.adminId, q ?? '');
  }

  @Get('chats')
  @ApiOperation({ summary: 'Мои чаты (последнее сообщение, непрочитанные, presence)' })
  async chats(@Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.chat.listChats(tenantId, req.adminId);
  }

  @Post('chats/dm')
  @ApiOperation({ summary: 'Найти-или-создать личный диалог' })
  async createDm(@Body() dto: CreateDmDto, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.chat.createDm(tenantId, req.adminId, dto.userId);
  }

  @Post('chats/group')
  @ApiOperation({ summary: 'Создать групповой чат' })
  async createGroup(@Body() dto: CreateGroupDto, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.chat.createGroup(tenantId, req.adminId, dto.title, dto.memberIds);
  }

  @Get('chats/:id/messages')
  @ApiOperation({ summary: 'Сообщения чата (+ кто печатает)' })
  messages(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @Query('before') before?: string,
  ) {
    return this.chat.messages(id, req.adminId, before);
  }

  @Post('chats/:id/messages')
  @ApiOperation({ summary: 'Отправить сообщение (опц. ответ-цитата, @упоминания)' })
  send(@Param('id') id: string, @Body() dto: SendMessageDto, @Req() req: AdminRequest) {
    return this.chat.send(id, req.adminId, dto.text, dto.replyToId, dto.mentionIds);
  }

  @Get('chats/:id/members')
  @ApiOperation({ summary: 'Участники чата (для @упоминаний)' })
  members(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.members(id, req.adminId);
  }

  @Post('chats/:id/messages/:mid/react')
  @ApiOperation({ summary: 'Реакция-эмодзи на сообщение (повторно — снять)' })
  react(
    @Param('id') id: string,
    @Param('mid') mid: string,
    @Body() dto: ReactDto,
    @Req() req: AdminRequest,
  ) {
    return this.chat.react(id, req.adminId, mid, dto.emoji);
  }

  @Patch('chats/:id/messages/:mid')
  @ApiOperation({ summary: 'Редактировать своё сообщение' })
  edit(
    @Param('id') id: string,
    @Param('mid') mid: string,
    @Body() dto: EditMessageDto,
    @Req() req: AdminRequest,
  ) {
    return this.chat.editMessage(id, req.adminId, mid, dto.text);
  }

  @Delete('chats/:id/messages/:mid')
  @ApiOperation({ summary: 'Удалить своё сообщение' })
  remove(@Param('id') id: string, @Param('mid') mid: string, @Req() req: AdminRequest) {
    return this.chat.deleteMessage(id, req.adminId, mid);
  }

  @Post('chats/:id/messages/:mid/pin')
  @ApiOperation({ summary: 'Закрепить/открепить сообщение (toggle)' })
  pin(@Param('id') id: string, @Param('mid') mid: string, @Req() req: AdminRequest) {
    return this.chat.togglePin(id, req.adminId, mid);
  }

  @Get('chats/:id/pins')
  @ApiOperation({ summary: 'Закреплённые сообщения чата' })
  pins(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.pins(id, req.adminId);
  }

  @Get('chats/:id/search')
  @ApiOperation({ summary: 'Поиск по сообщениям чата' })
  search(@Param('id') id: string, @Req() req: AdminRequest, @Query('q') q?: string) {
    return this.chat.search(id, req.adminId, q ?? '');
  }

  @Get('chats/:id/media')
  @ApiOperation({ summary: 'Медиа/файлы/ссылки чата (карточка чата)' })
  media(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.media(id, req.adminId);
  }

  @Get('chats/:id/common')
  @ApiOperation({ summary: 'Общие групповые чаты с собеседником (карточка DM)' })
  async common(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.commonChats(await this.tenant.getDefaultTenantId(), id, req.adminId);
  }

  @Post('chats/:id/attachment')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Отправить сообщение с вложением (файл ≤ 25 МБ)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  attachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AdminRequest,
    @Body('text') text?: string,
  ) {
    return this.chat.sendWithAttachment(id, req.adminId, file, text);
  }

  @Post('chats/:id/messages/:mid/save')
  @ApiOperation({ summary: 'Сохранить/убрать сообщение в избранное (toggle)' })
  save(@Param('id') id: string, @Param('mid') mid: string, @Req() req: AdminRequest) {
    return this.chat.toggleSave(id, req.adminId, mid);
  }

  @Get('saved')
  @ApiOperation({ summary: 'Избранные (сохранённые) сообщения' })
  saved(@Req() req: AdminRequest) {
    return this.chat.savedMessages(req.adminId);
  }

  @Get('folders')
  @ApiOperation({ summary: 'Мои папки-разделы' })
  folders(@Req() req: AdminRequest) {
    return this.chat.folders(req.adminId);
  }

  @Post('folders')
  @ApiOperation({ summary: 'Создать папку' })
  createFolder(@Body() dto: FolderCreateDto, @Req() req: AdminRequest) {
    return this.chat.createFolder(req.adminId, dto.name);
  }

  @Patch('folders/:id')
  @ApiOperation({ summary: 'Изменить папку (имя/состав/порядок)' })
  updateFolder(@Param('id') id: string, @Body() dto: FolderUpdateDto, @Req() req: AdminRequest) {
    return this.chat.updateFolder(req.adminId, id, dto);
  }

  @Delete('folders/:id')
  @ApiOperation({ summary: 'Удалить папку' })
  deleteFolder(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.deleteFolder(req.adminId, id);
  }

  @Post('chats/:id/read')
  @ApiOperation({ summary: 'Отметить чат прочитанным' })
  read(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.markRead(id, req.adminId);
  }

  @Post('chats/:id/typing')
  @ApiOperation({ summary: 'Сигнал «печатает»' })
  typing(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.chat.setTyping(id, req.adminId);
  }

  @Post('chats/:id/notify')
  @ApiOperation({ summary: 'Настройки уведомлений в чате (режим/заглушка)' })
  notify(@Param('id') id: string, @Body() dto: NotifyDto, @Req() req: AdminRequest) {
    return this.chat.setNotify(id, req.adminId, dto);
  }
}
