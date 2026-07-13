import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';

export type PublicResourceType = 'kb_page' | 'drive_file';

/**
 * Публичные ссылки (KB-DRIVE-TZ.md §5.4) — единый механизм для страниц БЗ и файлов Диска.
 * Токен ≥128 бит, открытие без авторизации через /api/s/<token>, отзыв в один клик,
 * каждое открытие журналируется счётчиком.
 */
@Injectable()
export class PublicLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Создать (или вернуть уже действующую) публичную ссылку на ресурс. */
  async create(
    tenantId: string,
    dto: { resourceType?: string; resourceId?: string; expiresDays?: number },
    actorId?: string,
  ) {
    const resourceType = this.parseType(dto.resourceType);
    if (!dto.resourceId) throw new BadRequestException('Не указан ресурс');
    await this.assertResource(tenantId, resourceType, dto.resourceId);

    const active = await this.prisma.publicLink.findFirst({
      where: {
        tenantId, resourceType, resourceId: dto.resourceId, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (active && dto.expiresDays === undefined) return active;

    const link = await this.prisma.publicLink.create({
      data: {
        tenantId,
        resourceType,
        resourceId: dto.resourceId,
        token: randomBytes(16).toString('hex'), // 128 бит
        expiresAt: dto.expiresDays ? new Date(Date.now() + dto.expiresDays * 24 * 3600 * 1000) : null,
        createdById: actorId ?? null,
      },
    });
    await this.audit.record({
      tenantId, actorId, action: 'publiclink_created', entity: resourceType, entityId: dto.resourceId,
      payload: { linkId: link.id, expiresAt: link.expiresAt },
    });
    return link;
  }

  listFor(tenantId: string, resourceType: string, resourceId: string) {
    return this.prisma.publicLink.findMany({
      where: { tenantId, resourceType: this.parseType(resourceType), resourceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Все действующие ссылки тенанта с названиями ресурсов — экран «что торчит наружу» (§5.4). */
  async listActive(tenantId: string) {
    const links = await this.prisma.publicLink.findMany({
      where: { tenantId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const pageIds = links.filter((l) => l.resourceType === 'kb_page').map((l) => l.resourceId);
    const fileIds = links.filter((l) => l.resourceType === 'drive_file').map((l) => l.resourceId);
    const [pages, files] = await Promise.all([
      pageIds.length
        ? this.prisma.kbPage.findMany({ where: { id: { in: pageIds } }, select: { id: true, title: true, shortId: true } })
        : [],
      fileIds.length
        ? this.prisma.driveNode.findMany({ where: { id: { in: fileIds } }, select: { id: true, name: true, shortId: true, deletedAt: true } })
        : [],
    ]);
    const pageById = new Map(pages.map((p) => [p.id, p]));
    const fileById = new Map(files.map((f) => [f.id, f]));
    return links.map((l) => {
      const res = l.resourceType === 'kb_page' ? pageById.get(l.resourceId) : fileById.get(l.resourceId);
      const file = l.resourceType === 'drive_file' ? fileById.get(l.resourceId) : undefined;
      return {
        ...l,
        resourceName: (res && ('title' in res ? res.title : res.name)) ?? '(ресурс удалён)',
        resourceShortId: res?.shortId ?? null,
        resourceDeleted: !res || Boolean(file?.deletedAt),
      };
    });
  }

  async revoke(tenantId: string, id: string, actorId?: string) {
    const link = await this.prisma.publicLink.findFirst({ where: { id, tenantId } });
    if (!link) throw new NotFoundException('Ссылка не найдена');
    const updated = await this.prisma.publicLink.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({
      tenantId, actorId, action: 'publiclink_revoked', entity: link.resourceType, entityId: link.resourceId,
      payload: { linkId: id },
    });
    return updated;
  }

  /** Открытие по токену (без авторизации): валидация + счётчик. null — ссылки нет/умерла. */
  async open(token: string) {
    if (!/^[a-f0-9]{32}$/.test(token)) return null;
    const link = await this.prisma.publicLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) return null;
    await this.prisma.publicLink.update({ where: { id: link.id }, data: { openCount: { increment: 1 } } }).catch(() => undefined);
    return link;
  }

  /** Право на управление ссылкой ресурса: kb_page→kb_manage, drive_file→drive_manage. */
  requiredPerm(resourceType: string): string {
    return this.parseType(resourceType) === 'kb_page' ? 'kb_manage' : 'drive_manage';
  }

  assertPerm(perms: string[], resourceType: string) {
    if (!perms.includes(this.requiredPerm(resourceType))) {
      throw new ForbiddenException('Недостаточно прав для управления публичными ссылками');
    }
  }

  private parseType(t?: string): PublicResourceType {
    if (t === 'kb_page' || t === 'drive_file') return t;
    throw new BadRequestException('Неизвестный тип ресурса публичной ссылки');
  }

  private async assertResource(tenantId: string, type: PublicResourceType, id: string) {
    const found =
      type === 'kb_page'
        ? await this.prisma.kbPage.findFirst({ where: { id, tenantId }, select: { id: true } })
        : await this.prisma.driveNode.findFirst({ where: { id, tenantId, kind: 'FILE', deletedAt: null }, select: { id: true } });
    if (!found) throw new NotFoundException('Ресурс для публичной ссылки не найден');
  }
}
