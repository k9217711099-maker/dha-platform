import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query,
  Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { tmpdir } from 'node:os';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { CurrentAdminId } from '../admin/current-admin.decorator.js';
import { Req } from '@nestjs/common';
import type { AclActor } from '../acl/acl.service.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { JwtService } from '@nestjs/jwt';
import { AclLevel } from '@prisma/client';
import { DriveService } from './drive.service.js';
import type { WopiTokenPayload } from './wopi.controller.js';

/** Office-форматы для онлайн-редактирования через Collabora (§5.2). */
const OFFICE_EXT = /\.(docx?|xlsx?|pptx?|odt|ods|odp|csv)$/i;

/** Файлы пишутся multer'ом на диск; лимит одного файла — 500 МБ (квоты — этап 2). */
const FILE_UPLOAD = { dest: tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } };

/** Контекст сотрудника для ACL-проверок (KB-DRIVE-TZ.md §2). */
function actorOf(req: AdminRequest): AclActor {
  return { adminId: req.adminId, roleKey: req.adminRoleKey, perms: req.adminPerms };
}

/** Диск: `/api/v1/drive/*`, RBAC drive_* (KB-DRIVE-TZ.md §5). */
@ApiTags('drive')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/drive')
export class DriveController {
  constructor(
    private readonly drive: DriveService,
    private readonly tenant: TenantService,
    private readonly jwt: JwtService,
  ) {}

  /** Сессия онлайн-редактирования (Collabora/WOPI, §5.2). Требует COLLABORA_URL. */
  @Post('files/:id/edit-session')
  @RequirePermission('drive_edit')
  async editSession(@Param('id') id: string, @Req() req: AdminRequest) {
    const collabora = process.env.COLLABORA_URL?.replace(/\/$/, '');
    if (!collabora) throw new BadRequestException('Онлайн-редактор не настроен (COLLABORA_URL) — доступен после развёртывания на сервере');
    const tenantId = await this.tenant.getDefaultTenantId();
    const node = await this.drive.getFile(tenantId, id);
    if (!OFFICE_EXT.test(node.name)) throw new BadRequestException('Формат не поддерживается онлайн-редактором');
    const actor = actorOf(req);
    if (!(await this.drive.canAccess(tenantId, actor, id, AclLevel.EDITOR))) {
      throw new BadRequestException('Нет права редактирования этого файла');
    }
    const payload: WopiTokenPayload = {
      typ: 'wopi', sub: req.adminId, name: req.adminId, tenantId, fileId: id, canWrite: true,
    };
    const token = await this.jwt.signAsync(payload as unknown as Record<string, unknown>, { expiresIn: '10h' });
    const apiBase = (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    const wopiSrc = `${apiBase}/api/wopi/files/${id}`;
    return {
      editorUrl: `${collabora}/browser/dist/cool.html?WOPISrc=${encodeURIComponent(wopiSrc)}&access_token=${encodeURIComponent(token)}`,
    };
  }

  @Get('nodes')
  @RequirePermission('drive_view')
  async list(@Req() req: AdminRequest, @Query('parentId') parentId?: string) {
    return this.drive.list(await this.tenant.getDefaultTenantId(), parentId || null, actorOf(req));
  }

  @Get('search')
  @RequirePermission('drive_view')
  async search(@Req() req: AdminRequest, @Query('q') q?: string) {
    return this.drive.search(await this.tenant.getDefaultTenantId(), q ?? '', actorOf(req));
  }

  @Get('trash')
  @RequirePermission('drive_view')
  async trash() {
    return this.drive.trash(await this.tenant.getDefaultTenantId());
  }

  /** Занято места / квота (§5.1). */
  @Get('usage')
  @RequirePermission('drive_view')
  async usage() {
    return this.drive.usage(await this.tenant.getDefaultTenantId());
  }

  @Get('r/:shortId')
  @RequirePermission('drive_view')
  async resolve(@Param('shortId') shortId: string, @Req() req: AdminRequest) {
    return this.drive.resolveShortId(await this.tenant.getDefaultTenantId(), shortId, actorOf(req));
  }

  @Post('folders')
  @RequirePermission('drive_edit')
  async createFolder(@Body() dto: { parentId?: string | null; name?: string }, @Req() req?: AdminRequest) {
    return this.drive.createFolder(await this.tenant.getDefaultTenantId(), dto, req?.adminId, req && actorOf(req));
  }

  @Post('upload')
  @RequirePermission('drive_edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', FILE_UPLOAD))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { parentId?: string },
    @Req() req?: AdminRequest,
  ) {
    if (!file?.path) throw new BadRequestException('Файл не передан');
    return this.drive.upload(await this.tenant.getDefaultTenantId(), body.parentId || null, file, req?.adminId, req && actorOf(req));
  }

  @Patch('nodes/:id')
  @RequirePermission('drive_edit')
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; parentId?: string | null },
    @Req() req?: AdminRequest,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const actor = req && actorOf(req);
    let node = null;
    if (dto.name !== undefined) node = await this.drive.rename(tenantId, id, dto.name, req?.adminId, actor);
    if (dto.parentId !== undefined) node = await this.drive.move(tenantId, id, dto.parentId, req?.adminId, actor);
    if (!node) throw new BadRequestException('Нечего менять');
    return node;
  }

  @Delete('nodes/:id')
  @RequirePermission('drive_edit')
  async remove(@Param('id') id: string, @Req() req?: AdminRequest) {
    return this.drive.remove(await this.tenant.getDefaultTenantId(), id, req?.adminId, req && actorOf(req));
  }

  @Post('nodes/:id/restore')
  @RequirePermission('drive_edit')
  async restore(@Param('id') id: string, @CurrentAdminId() actorId?: string) {
    return this.drive.restore(await this.tenant.getDefaultTenantId(), id, actorId);
  }

  @Delete('nodes/:id/purge')
  @RequirePermission('drive_manage')
  async purge(@Param('id') id: string, @CurrentAdminId() actorId?: string) {
    return this.drive.purge(await this.tenant.getDefaultTenantId(), id, actorId);
  }

  @Post('mindmaps')
  @RequirePermission('drive_edit')
  async createMindmap(@Body() dto: { parentId?: string | null; name?: string }, @Req() req?: AdminRequest) {
    return this.drive.createMindmap(await this.tenant.getDefaultTenantId(), dto, req?.adminId, req && actorOf(req));
  }

  /** Текстовый контент для встроенных редакторов (ментальные карты .dmap). */
  @Get('files/:id/content')
  @RequirePermission('drive_view')
  async content(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.drive.getTextContent(await this.tenant.getDefaultTenantId(), id, actorOf(req));
  }

  @Put('files/:id/content')
  @RequirePermission('drive_edit')
  async saveContent(@Param('id') id: string, @Body() dto: { content?: string }, @Req() req: AdminRequest) {
    if (typeof dto.content !== 'string') throw new BadRequestException('Нет контента');
    return this.drive.saveTextContent(await this.tenant.getDefaultTenantId(), id, dto.content, req.adminId, actorOf(req));
  }

  @Get('files/:id/versions')
  @RequirePermission('drive_view')
  async versions(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.drive.versions(await this.tenant.getDefaultTenantId(), id, actorOf(req));
  }

  /** Скачивание — только через backend (проверка прав), §1.3. inline для превью. */
  @Get('files/:id/download')
  @RequirePermission('drive_view')
  async download(
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: AdminRequest,
    @Query('v') v?: string,
    @Query('inline') inline?: string,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const f = await this.drive.fileStream(tenantId, id, v ? Number(v) : undefined, actorOf(req));
    const disposition = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', String(f.size));
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    f.stream.pipe(res);
  }
}
