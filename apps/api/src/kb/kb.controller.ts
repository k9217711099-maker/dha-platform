import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req,
  BadRequestException, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { tmpdir } from 'node:os';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import type { AclActor } from '../acl/acl.service.js';
import { KbImportService } from './import/kb-import.service.js';
import { KbAskService } from './kb-ask.service.js';
import { KbService, type KbPageInput } from './kb.service.js';

/** Импорт-архив пишется multer'ом на диск (не в память): экспорт B24 бывает сотни МБ. */
const ZIP_UPLOAD = { dest: tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } };

/** Контекст сотрудника для ACL-проверок (KB-DRIVE-TZ.md §2). */
function actorOf(req: AdminRequest): AclActor {
  return { adminId: req.adminId, roleKey: req.adminRoleKey, perms: req.adminPerms };
}

/** База знаний: `/api/v1/kb/*`, RBAC kb_* + точечные ACL-гранты (KB-DRIVE-TZ.md §7, §10). */
@ApiTags('kb')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/kb')
export class KbController {
  constructor(
    private readonly kb: KbService,
    private readonly kbImport: KbImportService,
    private readonly kbAsk: KbAskService,
    private readonly tenant: TenantService,
  ) {}

  // ─── Базы ───

  @Get('bases')
  @RequirePermission('kb_view')
  async bases(@Req() req: AdminRequest) {
    return this.kb.listBases(await this.tenant.getDefaultTenantId(), actorOf(req));
  }

  @Post('bases')
  @RequirePermission('kb_manage')
  async createBase(@Body() dto: { name?: string; icon?: string | null }, @Req() req: AdminRequest) {
    return this.kb.createBase(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  @Patch('bases/:id')
  @RequirePermission('kb_manage')
  async updateBase(
    @Param('id') id: string,
    @Body() dto: { name?: string; icon?: string | null; sortOrder?: number },
    @Req() req: AdminRequest,
  ) {
    return this.kb.updateBase(await this.tenant.getDefaultTenantId(), id, dto, req.adminId);
  }

  @Delete('bases/:id')
  @RequirePermission('kb_manage')
  async deleteBase(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.kb.deleteBase(await this.tenant.getDefaultTenantId(), id, req.adminId);
  }

  @Get('bases/:id/pages')
  @RequirePermission('kb_view')
  async pages(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.kb.pagesOfBase(await this.tenant.getDefaultTenantId(), id, actorOf(req));
  }

  // ─── Поиск и постоянные ссылки (до маршрутов с :id) ───

  @Get('search')
  @RequirePermission('kb_view')
  async search(@Req() req: AdminRequest, @Query('q') q?: string) {
    return this.kb.search(await this.tenant.getDefaultTenantId(), q ?? '', actorOf(req));
  }

  /** «Спросить базу знаний» — AI-ответ с цитатами (§4.3). Отдельное право: тратит токены. */
  @Post('ask')
  @RequirePermission('search_ask')
  async ask(@Body() dto: { question?: string }, @Req() req: AdminRequest) {
    return this.kbAsk.ask(await this.tenant.getDefaultTenantId(), dto.question ?? '', actorOf(req));
  }

  /** Резолв постоянной ссылки /kb/r/<shortId> (§3.3). */
  @Get('r/:shortId')
  @RequirePermission('kb_view')
  async resolve(@Param('shortId') shortId: string, @Req() req: AdminRequest) {
    return this.kb.resolveShortId(await this.tenant.getDefaultTenantId(), shortId, actorOf(req));
  }

  // ─── Импорт Bitrix24 ───

  @Post('import/bitrix24')
  @RequirePermission('kb_import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', ZIP_UPLOAD))
  async importDryRun(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.path) throw new BadRequestException('Загрузите ZIP-архив экспорта Bitrix24');
    return this.kbImport.dryRun(await this.tenant.getDefaultTenantId(), file.path);
  }

  @Post('import/bitrix24/confirm')
  @RequirePermission('kb_import')
  async importConfirm(@Body() dto: { token?: string; mode?: 'skip' | 'update' }, @Req() req: AdminRequest) {
    if (!dto.token) throw new BadRequestException('Нет токена сессии импорта');
    return this.kbImport.confirm(await this.tenant.getDefaultTenantId(), dto.token, dto.mode === 'update' ? 'update' : 'skip', req.adminId);
  }

  @Get('import/jobs')
  @RequirePermission('kb_import')
  async importJobs() {
    return this.kbImport.listJobs(await this.tenant.getDefaultTenantId());
  }

  // ─── Страницы ───

  @Get('pages/:id')
  @RequirePermission('kb_view')
  async page(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.kb.getPage(await this.tenant.getDefaultTenantId(), id, actorOf(req));
  }

  @Post('pages')
  @RequirePermission('kb_edit')
  async createPage(@Body() dto: KbPageInput & { baseId: string }, @Req() req: AdminRequest) {
    return this.kb.createPage(await this.tenant.getDefaultTenantId(), dto, req.adminId, actorOf(req));
  }

  @Patch('pages/:id')
  @RequirePermission('kb_edit')
  async updatePage(@Param('id') id: string, @Body() dto: KbPageInput, @Req() req: AdminRequest) {
    return this.kb.updatePage(await this.tenant.getDefaultTenantId(), id, dto, req.adminId, actorOf(req));
  }

  @Delete('pages/:id')
  @RequirePermission('kb_edit')
  async deletePage(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.kb.deletePage(await this.tenant.getDefaultTenantId(), id, req.adminId, actorOf(req));
  }

  /** Мягкая блокировка редактирования (§3.2): захват/heartbeat/{release}/перехват{force}. */
  @Post('pages/:id/editing')
  @RequirePermission('kb_edit')
  async editing(
    @Param('id') id: string,
    @Body() dto: { release?: boolean; force?: boolean },
    @Req() req: AdminRequest,
  ) {
    return this.kb.editingLock(await this.tenant.getDefaultTenantId(), id, req.adminId, dto, actorOf(req));
  }

  @Get('pages/:id/versions')
  @RequirePermission('kb_view')
  async versions(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.kb.versions(await this.tenant.getDefaultTenantId(), id, actorOf(req));
  }

  @Get('pages/:id/versions/:n')
  @RequirePermission('kb_view')
  async version(@Param('id') id: string, @Param('n') n: string, @Req() req: AdminRequest) {
    return this.kb.getVersion(await this.tenant.getDefaultTenantId(), id, Number(n), actorOf(req));
  }

  @Post('pages/:id/versions/:n/restore')
  @RequirePermission('kb_edit')
  async restore(@Param('id') id: string, @Param('n') n: string, @Req() req: AdminRequest) {
    return this.kb.restoreVersion(await this.tenant.getDefaultTenantId(), id, Number(n), req.adminId, actorOf(req));
  }
}
