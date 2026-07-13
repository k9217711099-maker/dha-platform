import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { DriveService } from '../drive/drive.service.js';
import type { KbContent } from '../kb/content.js';
import { PublicLinkService } from './public-link.service.js';
import { renderPublicError, renderPublicKbPage } from './public-html.js';

/** Управление публичными ссылками (авторизованно). Право зависит от типа ресурса —
 *  kb_manage / drive_manage — поэтому проверяется в обработчике, а не декоратором. */
@ApiTags('links')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/links')
export class LinksController {
  constructor(
    private readonly links: PublicLinkService,
    private readonly tenant: TenantService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @Body() dto: { resourceType?: string; resourceId?: string; expiresDays?: number },
    @Req() req: AdminRequest,
  ) {
    this.links.assertPerm(req.adminPerms, dto.resourceType ?? '');
    return this.links.create(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  /** Экран аудита: все действующие публичные ссылки (§5.4). kb_manage ИЛИ drive_manage. */
  @Get('active')
  async active(@Req() req: AdminRequest) {
    if (!req.adminPerms.includes('kb_manage') && !req.adminPerms.includes('drive_manage')) {
      throw new ForbiddenException('Нужно право управления БЗ или Диском');
    }
    return this.links.listActive(await this.tenant.getDefaultTenantId());
  }

  @Get(':resourceType/:resourceId')
  async listFor(@Param('resourceType') resourceType: string, @Param('resourceId') resourceId: string) {
    return this.links.listFor(await this.tenant.getDefaultTenantId(), resourceType, resourceId);
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const link = await this.prisma.publicLink.findFirst({ where: { id, tenantId } });
    if (!link) throw new NotFoundException('Ссылка не найдена');
    this.links.assertPerm(req.adminPerms, link.resourceType);
    return this.links.revoke(tenantId, id, req.adminId);
  }
}

/** Типы, которые безопасно показывать в браузере по публичной ссылке. */
const INLINE_MIME = /^(image\/|video\/|audio\/|application\/pdf$|text\/plain$)/;

/** Публичный доступ по токену: /api/s/<token> — без авторизации (KB-DRIVE-TZ.md §5.4). */
@ApiTags('links')
@Controller('s')
export class PublicAccessController {
  constructor(
    private readonly links: PublicLinkService,
    private readonly prisma: PrismaService,
    private readonly drive: DriveService,
  ) {}

  @Get(':token')
  async open(@Param('token') token: string, @Res() res: Response) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const link = await this.links.open(token);
    if (!link) {
      res.status(404).type('html').send(renderPublicError('Ссылка отозвана, истекла или не существует.'));
      return;
    }
    if (link.resourceType === 'kb_page') {
      const page = await this.prisma.kbPage.findFirst({ where: { id: link.resourceId, tenantId: link.tenantId } });
      if (!page) {
        res.status(404).type('html').send(renderPublicError('Страница была удалена.'));
        return;
      }
      const content = page.content as unknown as KbContent;
      res.type('html').send(renderPublicKbPage(page.title, content.blocks ?? []));
      return;
    }
    // drive_file — отдаём файл: картинки/PDF в браузер, остальное на скачивание
    try {
      const f = await this.drive.fileStream(link.tenantId, link.resourceId);
      const disposition = INLINE_MIME.test(f.mime) ? 'inline' : 'attachment';
      res.setHeader('Content-Type', f.mime);
      res.setHeader('Content-Length', String(f.size));
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
      f.stream.pipe(res);
    } catch {
      res.status(404).type('html').send(renderPublicError('Файл был удалён.'));
    }
  }
}
