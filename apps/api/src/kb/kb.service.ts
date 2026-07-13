import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AclLevel, KbPageStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { AclService, allows, resolveChain, type AclActor, type ResolvedAccess } from '../acl/acl.service.js';
import { contentToSearchText, kbSlugify, looksLikeSecret, newShortId, normalizeContent, EMPTY_CONTENT, type KbContent } from './content.js';

export interface KbPageInput {
  title?: string;
  icon?: string | null;
  content?: KbContent;
  parentId?: string | null;
  sortOrder?: number;
  status?: KbPageStatus;
  tags?: string[];
  guestAgentVisible?: boolean;
  /** Черновик подготовлен AI-агентом — атрибуция в первой версии (ТЗ §3.5). */
  aiAssisted?: boolean;
}

export interface KbSearchHit {
  id: string;
  baseId: string;
  title: string;
  shortId: string;
  snippet: string;
  rank: number;
  /** Хит из ослабленного OR-поиска (совпало не всё) — в LLM такое не отдаём. */
  weak?: boolean;
}

const PAGE_LIST_SELECT = {
  id: true, baseId: true, parentId: true, title: true, slug: true, shortId: true,
  icon: true, status: true, sortOrder: true, externalId: true, updatedAt: true,
} as const;

/** База знаний: базы, дерево страниц, версии, постоянные ссылки, поиск (KB-DRIVE-TZ.md §3–4). */
@Injectable()
export class KbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acl: AclService,
  ) {}

  // ─── ACL: резолв доступа по дереву (ближайший узел с грантами решает, §2) ───

  private async accessResolver(tenantId: string, actor: AclActor | undefined, baseIds: string[]) {
    const open = { page: (_: string) => 'default' as ResolvedAccess, base: (_: string) => 'default' as ResolvedAccess };
    if (!actor || this.acl.bypasses(actor, 'kb_page') || baseIds.length === 0) return open;
    const [pages, entries, subjects] = await Promise.all([
      this.prisma.kbPage.findMany({ where: { tenantId, baseId: { in: baseIds } }, select: { id: true, parentId: true, baseId: true } }),
      this.acl.entriesByTypes(tenantId, ['kb_base', 'kb_page']),
      this.acl.subjectsOf(actor),
    ]);
    if (entries.size === 0) return open; // грантов в БЗ нет вовсе — действует только RBAC
    const byId = new Map(pages.map((p) => [p.id, p]));
    const baseMemo = new Map<string, ResolvedAccess>();
    const base = (baseId: string): ResolvedAccess => {
      if (!baseMemo.has(baseId)) baseMemo.set(baseId, resolveChain([entries.get(`kb_base:${baseId}`) ?? []], subjects));
      return baseMemo.get(baseId)!;
    };
    const memo = new Map<string, ResolvedAccess>();
    const page = (pageId: string): ResolvedAccess => {
      const cached = memo.get(pageId);
      if (cached !== undefined) return cached;
      const p = byId.get(pageId);
      if (!p) return 'default';
      const own = entries.get(`kb_page:${pageId}`) ?? [];
      const res: ResolvedAccess = own.length > 0 ? resolveChain([own], subjects) : p.parentId ? page(p.parentId) : base(p.baseId);
      memo.set(pageId, res);
      return res;
    };
    return { page, base };
  }

  private async requirePageAccess(tenantId: string, actor: AclActor | undefined, pageId: string, baseId: string, level: AclLevel) {
    if (!actor) return;
    const acc = await this.accessResolver(tenantId, actor, [baseId]);
    if (!allows(acc.page(pageId), level)) {
      throw new ForbiddenException('Нет доступа к этой странице (см. «Доступы» базы знаний)');
    }
  }

  // ─── Базы ───

  async listBases(tenantId: string, actor?: AclActor) {
    const bases = await this.prisma.kbBase.findMany({
      where: { tenantId },
      include: { _count: { select: { pages: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!actor) return bases;
    const acc = await this.accessResolver(tenantId, actor, bases.map((b) => b.id));
    return bases.filter((b) => allows(acc.base(b.id), AclLevel.VIEWER));
  }

  async createBase(tenantId: string, dto: { name?: string; icon?: string | null }, actorId?: string) {
    const name = dto.name?.trim() || 'Новая база знаний';
    const base = await this.prisma.kbBase.create({
      data: { tenantId, name, slug: await this.uniqueBaseSlug(tenantId, kbSlugify(name)), icon: dto.icon ?? null },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'kb_base', entityId: base.id, payload: { name } });
    return base;
  }

  async updateBase(tenantId: string, id: string, dto: { name?: string; icon?: string | null; sortOrder?: number }, actorId?: string) {
    await this.getBase(tenantId, id);
    const base = await this.prisma.kbBase.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'kb_base', entityId: id, payload: { ...dto } });
    return base;
  }

  async deleteBase(tenantId: string, id: string, actorId?: string) {
    const base = await this.getBase(tenantId, id);
    await this.prisma.kbBase.delete({ where: { id } }); // страницы каскадом
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'kb_base', entityId: id, payload: { name: base.name } });
    return { ok: true };
  }

  async getBase(tenantId: string, id: string) {
    const base = await this.prisma.kbBase.findFirst({ where: { id, tenantId } });
    if (!base) throw new NotFoundException('База знаний не найдена');
    return base;
  }

  private async uniqueBaseSlug(tenantId: string, slug: string): Promise<string> {
    let candidate = slug;
    for (let i = 2; await this.prisma.kbBase.findFirst({ where: { tenantId, slug: candidate } }); i++) candidate = `${slug}-${i}`;
    return candidate;
  }

  // ─── Страницы ───

  /** Плоский список страниц базы — дерево собирает клиент (parentId/sortOrder).
   *  ACL-фильтрация: скрытые страницы выпадают, доступные «сироты» поднимаются к корню. */
  async pagesOfBase(tenantId: string, baseId: string, actor?: AclActor) {
    await this.getBase(tenantId, baseId);
    const pages = await this.prisma.kbPage.findMany({
      where: { tenantId, baseId },
      select: PAGE_LIST_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!actor) return pages;
    const acc = await this.accessResolver(tenantId, actor, [baseId]);
    const visible = pages.filter((p) => allows(acc.page(p.id), AclLevel.VIEWER));
    const visibleIds = new Set(visible.map((p) => p.id));
    const byId = new Map(pages.map((p) => [p.id, p]));
    return visible.map((p) => {
      let parentId = p.parentId;
      while (parentId && !visibleIds.has(parentId)) parentId = byId.get(parentId)?.parentId ?? null;
      return parentId === p.parentId ? p : { ...p, parentId };
    });
  }

  async getPage(tenantId: string, id: string, actor?: AclActor) {
    const page = await this.prisma.kbPage.findFirst({
      where: { id, tenantId },
      include: { base: { select: { id: true, name: true, slug: true } } },
    });
    if (!page) throw new NotFoundException('Страница не найдена');
    await this.requirePageAccess(tenantId, actor, page.id, page.baseId, AclLevel.VIEWER);
    return page;
  }

  /** Постоянная ссылка: /kb/r/<shortId> — работает после любых переименований (§3.3). */
  async resolveShortId(tenantId: string, shortId: string, actor?: AclActor) {
    const page = await this.prisma.kbPage.findFirst({ where: { shortId, tenantId }, select: PAGE_LIST_SELECT });
    if (!page) throw new NotFoundException('Страница не найдена');
    await this.requirePageAccess(tenantId, actor, page.id, page.baseId, AclLevel.VIEWER);
    return page;
  }

  async createPage(tenantId: string, dto: KbPageInput & { baseId: string }, actorId?: string, actor?: AclActor) {
    await this.getBase(tenantId, dto.baseId);
    if (dto.parentId) await this.assertPageInBase(tenantId, dto.parentId, dto.baseId);
    if (actor) {
      const acc = await this.accessResolver(tenantId, actor, [dto.baseId]);
      const resolved = dto.parentId ? acc.page(dto.parentId) : acc.base(dto.baseId);
      if (!allows(resolved, AclLevel.EDITOR)) throw new ForbiddenException('Нет права создавать страницы здесь');
    }
    const title = dto.title?.trim() || 'Новая страница';
    const content = normalizeContent(dto.content ?? EMPTY_CONTENT);
    const page = await this.prisma.kbPage.create({
      data: {
        tenantId,
        baseId: dto.baseId,
        parentId: dto.parentId ?? null,
        title,
        slug: kbSlugify(title),
        shortId: newShortId(),
        icon: dto.icon ?? null,
        status: dto.status ?? KbPageStatus.DRAFT,
        tags: dto.tags ?? [],
        content: content as unknown as Prisma.InputJsonValue,
        searchText: contentToSearchText(content),
        sortOrder: dto.sortOrder ?? 0,
        createdById: actorId ?? null,
        updatedById: actorId ?? null,
      },
    });
    if (dto.aiAssisted) {
      await this.prisma.kbPageVersion.create({
        data: { pageId: page.id, n: 1, title, content: content as unknown as Prisma.InputJsonValue, authorId: actorId ?? null, aiAssisted: true },
      });
    }
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'kb_page', entityId: page.id, payload: { title, aiAssisted: dto.aiAssisted ?? false } });
    // Детектор секретов (§8): пароли в БЗ запрещены — предупреждаем и просим перенести в «Секреты»
    return { ...page, secretWarning: looksLikeSecret(page.searchText) };
  }

  async updatePage(tenantId: string, id: string, dto: KbPageInput, actorId?: string, actor?: AclActor) {
    const page = await this.getPage(tenantId, id);
    await this.requirePageAccess(tenantId, actor, page.id, page.baseId, AclLevel.EDITOR);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertPageInBase(tenantId, dto.parentId, page.baseId);
      await this.assertNoCycle(id, dto.parentId);
      await this.requirePageAccess(tenantId, actor, dto.parentId, page.baseId, AclLevel.EDITOR);
    }
    if (dto.content !== undefined) dto.content = normalizeContent(dto.content);
    const contentChanged = dto.content !== undefined;
    const titleChanged = dto.title !== undefined && dto.title.trim() !== page.title;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (contentChanged || titleChanged) {
        // В историю уходит состояние ДО изменения — restore(n) возвращает страницу
        // к тому виду, в котором она была перед n-м изменением.
        const last = await tx.kbPageVersion.findFirst({ where: { pageId: id }, orderBy: { n: 'desc' }, select: { n: true } });
        await tx.kbPageVersion.create({
          data: {
            pageId: id,
            n: (last?.n ?? 0) + 1,
            title: page.title,
            content: page.content as Prisma.InputJsonValue,
            authorId: actorId ?? null,
          },
        });
      }
      return tx.kbPage.update({
        where: { id },
        data: {
          ...(titleChanged ? { title: dto.title!.trim(), slug: kbSlugify(dto.title!.trim()) } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(contentChanged
            ? { content: dto.content as unknown as Prisma.InputJsonValue, searchText: contentToSearchText(dto.content!) }
            : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.guestAgentVisible !== undefined ? { guestAgentVisible: dto.guestAgentVisible } : {}),
          updatedById: actorId ?? null,
        },
      });
    });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'kb_page', entityId: id, payload: { title: updated.title, contentChanged } });
    return { ...updated, secretWarning: looksLikeSecret(updated.searchText) };
  }

  /** Удаление страницы вместе с поддеревом. */
  async deletePage(tenantId: string, id: string, actorId?: string, actor?: AclActor) {
    const page = await this.getPage(tenantId, id);
    await this.requirePageAccess(tenantId, actor, page.id, page.baseId, AclLevel.EDITOR);
    const ids = [id, ...(await this.descendantIds(tenantId, page.baseId, id))];
    await this.prisma.kbPage.deleteMany({ where: { id: { in: ids }, tenantId } });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'kb_page', entityId: id, payload: { title: page.title, withChildren: ids.length - 1 } });
    return { ok: true, deleted: ids.length };
  }

  // ─── Мягкая блокировка редактирования (§3.2) ───

  /** TTL блокировки: без heartbeat'а редактор считается ушедшим через 90 секунд. */
  private static readonly EDIT_LOCK_TTL_MS = 90_000;

  /**
   * Захват/продление/освобождение блокировки. Возвращает {ok} либо {lockedBy…},
   * если страницу свежо редактирует другой сотрудник (перехват — force).
   */
  async editingLock(
    tenantId: string,
    id: string,
    actorId: string,
    opts: { release?: boolean; force?: boolean },
    actor?: AclActor,
  ): Promise<{ ok: true } | { locked: true; lockedByName: string }> {
    const page = await this.getPage(tenantId, id, actor);
    await this.requirePageAccess(tenantId, actor, page.id, page.baseId, AclLevel.EDITOR);
    if (opts.release) {
      if (page.editingById === actorId) {
        await this.prisma.kbPage.update({ where: { id }, data: { editingById: null, editingAt: null } });
      }
      return { ok: true };
    }
    const fresh = page.editingAt && page.editingAt.getTime() > Date.now() - KbService.EDIT_LOCK_TTL_MS;
    if (fresh && page.editingById && page.editingById !== actorId && !opts.force) {
      const user = await this.prisma.adminUser.findUnique({ where: { id: page.editingById }, select: { name: true, email: true } });
      return { locked: true, lockedByName: user?.name ?? user?.email ?? 'другой сотрудник' };
    }
    await this.prisma.kbPage.update({ where: { id }, data: { editingById: actorId, editingAt: new Date() } });
    return { ok: true };
  }

  // ─── Гостевой AI-агент (§4.3): только явно помеченные страницы ───

  /** Оставить в выдаче только страницы с guestAgentVisible=true. */
  async filterGuestVisible(tenantId: string, hits: KbSearchHit[]): Promise<KbSearchHit[]> {
    if (hits.length === 0) return hits;
    const rows = await this.prisma.kbPage.findMany({
      where: { tenantId, id: { in: hits.map((h) => h.id) }, guestAgentVisible: true },
      select: { id: true },
    });
    const ok = new Set(rows.map((r) => r.id));
    return hits.filter((h) => ok.has(h.id));
  }

  /** Есть ли вообще страницы для гостевого агента (отличаем «не настроено» от «не нашлось»). */
  async hasGuestVisiblePages(tenantId: string): Promise<boolean> {
    return (await this.prisma.kbPage.count({ where: { tenantId, guestAgentVisible: true } })) > 0;
  }

  // ─── Версии ───

  async versions(tenantId: string, pageId: string, actor?: AclActor) {
    await this.getPage(tenantId, pageId, actor);
    return this.prisma.kbPageVersion.findMany({
      where: { pageId },
      orderBy: { n: 'desc' },
      select: { id: true, n: true, title: true, authorId: true, aiAssisted: true, createdAt: true },
    });
  }

  async getVersion(tenantId: string, pageId: string, n: number, actor?: AclActor) {
    await this.getPage(tenantId, pageId, actor);
    const v = await this.prisma.kbPageVersion.findUnique({ where: { pageId_n: { pageId, n } } });
    if (!v) throw new NotFoundException('Версия не найдена');
    return v;
  }

  async restoreVersion(tenantId: string, pageId: string, n: number, actorId?: string, actor?: AclActor) {
    const v = await this.getVersion(tenantId, pageId, n, actor);
    return this.updatePage(tenantId, pageId, { title: v.title, content: v.content as unknown as KbContent }, actorId, actor);
  }

  // ─── Поиск (FTS russian; гибрид с pgvector — этап 2) ───

  /** Гранты применяются к выдаче ДО показа и до передачи в LLM (§1.4). */
  private async filterHitsByAcl(tenantId: string, actor: AclActor | undefined, hits: KbSearchHit[]): Promise<KbSearchHit[]> {
    if (!actor || hits.length === 0) return hits;
    const acc = await this.accessResolver(tenantId, actor, [...new Set(hits.map((h) => h.baseId))]);
    return hits.filter((h) => allows(acc.page(h.id), AclLevel.VIEWER));
  }

  async search(tenantId: string, q: string, actor?: AclActor): Promise<KbSearchHit[]> {
    const query = q.trim().slice(0, 200);
    if (!query) return [];
    const hits = await this.prisma.$queryRaw<KbSearchHit[]>`
      SELECT p.id, p."baseId", p.title, p."shortId",
        ts_headline('russian', p.title || '. ' || p."searchText", q,
          'MaxFragments=2, MaxWords=18, MinWords=4, StartSel=<mark>, StopSel=</mark>') AS snippet,
        ts_rank(to_tsvector('russian', p.title || ' ' || p."searchText"), q)::float8 AS rank
      FROM kb_pages p, websearch_to_tsquery('russian', ${query}) q
      WHERE p."tenantId" = ${tenantId}
        AND to_tsvector('russian', p.title || ' ' || p."searchText") @@ q
      ORDER BY rank DESC
      LIMIT 20`;
    if (hits.length > 0) return this.filterHitsByAcl(tenantId, actor, hits);
    // Фоллбэк — пословный ILIKE (все слова обязаны встретиться). Нужен для частичных
    // слов («прачечн») и для локального dev: встроенный Postgres инициализирован с
    // локалью C, кириллица в to_tsvector не токенизируется (на сервере FTS работает).
    // Псевдо-стемминг: усечение окончаний («ночной»→«ночн» находит «ночного заезда»)
    const words = query
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2)
      .map((w) => (w.length >= 5 ? w.slice(0, Math.max(4, w.length - 2)) : w))
      .slice(0, 8);
    if (words.length === 0) return [];
    const wordCond = (w: string) => ({
      OR: [{ title: { contains: w, mode: 'insensitive' as const } }, { searchText: { contains: w, mode: 'insensitive' as const } }],
    });
    const select = { id: true, baseId: true, title: true, shortId: true, searchText: true } as const;
    let like = await this.prisma.kbPage.findMany({
      where: { tenantId, AND: words.map(wordCond) },
      select,
      take: 20,
    });
    let weak = false;
    if (like.length === 0 && words.length > 1) {
      // Все слова вместе не встретились — ослабляем до «хотя бы одно слово»
      weak = true;
      like = await this.prisma.kbPage.findMany({ where: { tenantId, OR: words.map(wordCond) }, select, take: 20 });
    }
    const scored = like
      .map((p) => {
        const titleHits = words.filter((w) => p.title.toLowerCase().includes(w.toLowerCase())).length;
        const first = words[0]!.toLowerCase();
        const at = p.searchText.toLowerCase().indexOf(first);
        const snippet = at >= 0 ? `…${p.searchText.slice(Math.max(0, at - 60), at + 100)}…` : p.searchText.slice(0, 160);
        return { id: p.id, baseId: p.baseId, title: p.title, shortId: p.shortId, snippet, rank: titleHits / (words.length + 1), weak };
      })
      .sort((a, b) => b.rank - a.rank);
    return this.filterHitsByAcl(tenantId, actor, scored);
  }

  // ─── Внутренние помощники ───

  private async assertPageInBase(tenantId: string, pageId: string, baseId: string) {
    const p = await this.prisma.kbPage.findFirst({ where: { id: pageId, tenantId, baseId }, select: { id: true } });
    if (!p) throw new BadRequestException('Родительская страница не найдена в этой базе');
  }

  /** Защита от цикла: новый родитель не должен быть потомком страницы. */
  private async assertNoCycle(pageId: string, newParentId: string) {
    let cursor: string | null = newParentId;
    for (let depth = 0; cursor && depth < 100; depth++) {
      if (cursor === pageId) throw new BadRequestException('Нельзя переместить страницу внутрь её собственного поддерева');
      const parent: { parentId: string | null } | null = await this.prisma.kbPage.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  private async descendantIds(tenantId: string, baseId: string, rootId: string): Promise<string[]> {
    const all = await this.prisma.kbPage.findMany({ where: { tenantId, baseId }, select: { id: true, parentId: true } });
    const children = new Map<string, string[]>();
    for (const p of all) {
      if (!p.parentId) continue;
      const list = children.get(p.parentId) ?? [];
      list.push(p.id);
      children.set(p.parentId, list);
    }
    const out: string[] = [];
    const queue = [...(children.get(rootId) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      out.push(id);
      queue.push(...(children.get(id) ?? []));
    }
    return out;
  }
}
