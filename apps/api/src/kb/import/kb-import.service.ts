import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, KbImportStatus, KbPageStatus } from '@prisma/client';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { contentToSearchText, kbSlugify, newShortId, type KbContent } from '../content.js';
import {
  buildTree,
  mapB24Page,
  parseB24Export,
  type B24Export,
  type B24Page,
  type MapContext,
} from './bitrix24.js';

const execFileAsync = promisify(execFile);
/** Сессия dry-run живёт 30 минут — дальше архив нужно загрузить заново. */
const SESSION_TTL_MS = 30 * 60 * 1000;

interface ImportSession {
  dir: string;
  parsed: B24Export;
  tenantId: string;
  expiresAt: number;
}

export interface ImportTreeNode {
  externalId: string;
  title: string;
  exists: boolean;
  children: ImportTreeNode[];
}

export interface DryRunReport {
  baseName: string;
  baseSlug: string;
  pagesTotal: number;
  pagesNew: number;
  pagesExisting: number;
  assetsUsed: number;
  assetsMissing: number;
  images: number;
  videos: number;
  unresolvedLinks: number;
  /** Страницы с нераспознанными фрагментами — «на доработку» (ТЗ §3.4). */
  needsReview: { title: string; details: string[] }[];
  tree: ImportTreeNode[];
}

export interface ConfirmResult {
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  assetsCopied: number;
  needsReview: { pageId: string; title: string; details: string[] }[];
}

/** Импорт базы знаний из ZIP-экспорта Bitrix24: dry-run → подтверждение (ТЗ §3.4). */
@Injectable()
export class KbImportService {
  private readonly log = new Logger(KbImportService.name);
  private readonly sessions = new Map<string, ImportSession>();
  private readonly uploadsDir = resolve(process.cwd(), 'uploads', 'kb');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  /** Шаг 1: распаковать архив, разобрать, посчитать отчёт. В БД ничего не пишет. */
  async dryRun(tenantId: string, zipPath: string): Promise<{ token: string; report: DryRunReport }> {
    const dir = join(tmpdir(), `dha-kb-import-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    try {
      await execFileAsync('unzip', ['-o', '-qq', zipPath, '-d', dir], { maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw new BadRequestException(`Не удалось распаковать архив: ${(e as Error).message}`);
    } finally {
      rmSync(zipPath, { force: true });
    }

    let parsed: B24Export;
    try {
      parsed = parseB24Export(dir);
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw new BadRequestException((e as Error).message);
    }

    const existing = await this.existingByExternalId(tenantId, parsed);
    const report = this.buildReport(parsed, existing);
    const token = randomUUID();
    this.gcSessions();
    this.sessions.set(token, { dir, parsed, tenantId, expiresAt: Date.now() + SESSION_TTL_MS });
    return { token, report };
  }

  /** Шаг 2: применить импорт. mode: skip — не трогать уже импортированные, update — обновить. */
  async confirm(tenantId: string, token: string, mode: 'skip' | 'update', actorId?: string): Promise<ConfirmResult> {
    const session = this.sessions.get(token);
    if (!session || session.tenantId !== tenantId || session.expiresAt < Date.now()) {
      throw new BadRequestException('Сессия импорта истекла — загрузите архив заново');
    }
    this.sessions.delete(token);
    const { parsed, dir } = session;

    const job = await this.prisma.kbImportJob.create({
      data: { tenantId, status: KbImportStatus.RUNNING, mode, createdById: actorId ?? null },
    });

    try {
      const result = await this.apply(tenantId, parsed, mode, actorId);
      await this.prisma.kbImportJob.update({
        where: { id: job.id },
        data: { status: KbImportStatus.DONE, report: result as unknown as Prisma.InputJsonValue },
      });
      await this.audit.record({
        tenantId, actorId, action: 'imported', entity: 'kb_base', entityId: job.id,
        payload: { created: result.created, updated: result.updated, skipped: result.skipped },
      });
      return { ...result, jobId: job.id };
    } catch (e) {
      const message = (e as Error).message;
      this.log.error(`Импорт БЗ провалился: ${message}`);
      await this.prisma.kbImportJob.update({ where: { id: job.id }, data: { status: KbImportStatus.FAILED, error: message } });
      throw e;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  listJobs(tenantId: string) {
    return this.prisma.kbImportJob.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
  }

  // ─── Применение ───

  private async apply(tenantId: string, parsed: B24Export, mode: 'skip' | 'update', actorId?: string) {
    const existing = await this.existingByExternalId(tenantId, parsed);
    const base = await this.ensureBase(tenantId, parsed);
    const parents = buildTree(parsed.pages, parsed.indexLandingId);
    const order = this.bfsOrder(parsed.pages, parents);

    // Постоянные ссылки должны быть известны до маппинга контента (двухпроходная схема ТЗ §3.4)
    const shortIds = new Map<string, string>();
    for (const p of parsed.pages) shortIds.set(p.id, existing.get(p.id)?.shortId ?? newShortId());

    const copied = new Map<string, string | null>();
    const ctx: MapContext = {
      resolveLink: (landingId) => (shortIds.has(landingId) ? `kb:${shortIds.get(landingId)}` : null),
      resolveAsset: (fileId) => this.copyAsset(parsed, fileId, copied),
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const needsReview: ConfirmResult['needsReview'] = [];
    const dbIds = new Map<string, string>(); // externalId → id в БД
    const siblingIndex = new Map<string, number>(); // parentExternalId|null → счётчик sortOrder

    for (const page of order) {
      const prior = existing.get(page.id);
      if (prior && mode === 'skip') {
        dbIds.set(page.id, prior.id);
        skipped += 1;
        continue;
      }
      const mapped = mapB24Page(page, ctx, parsed.fileNames);
      if (mapped.unknownBlocks.length > 0) {
        mapped.blocks.push({ type: 'raw', html: '', note: `Не распознано при импорте: ${mapped.unknownBlocks.join('; ')}` });
      }
      const content: KbContent = { blocks: mapped.blocks };
      const parentExt = parents.get(page.id) ?? null;
      const orderKey = parentExt ?? 'root';
      const sortOrder = siblingIndex.get(orderKey) ?? 0;
      siblingIndex.set(orderKey, sortOrder + 1);

      const data = {
        title: page.title,
        slug: kbSlugify(page.code || page.title),
        content: content as unknown as Prisma.InputJsonValue,
        searchText: contentToSearchText(content),
        sortOrder,
        updatedById: actorId ?? null,
      };
      if (prior) {
        await this.prisma.kbPage.update({ where: { id: prior.id }, data });
        dbIds.set(page.id, prior.id);
        updated += 1;
      } else {
        const createdPage = await this.prisma.kbPage.create({
          data: {
            ...data,
            tenantId,
            baseId: base.id,
            shortId: shortIds.get(page.id)!,
            status: KbPageStatus.PUBLISHED,
            externalId: page.id,
            createdById: actorId ?? null,
          },
        });
        dbIds.set(page.id, createdPage.id);
        created += 1;
      }
      if (mapped.unknownBlocks.length > 0) {
        needsReview.push({ pageId: dbIds.get(page.id)!, title: page.title, details: mapped.unknownBlocks });
      }
    }

    // Второй проход: родители (все id уже известны)
    for (const page of order) {
      const parentExt = parents.get(page.id) ?? null;
      const id = dbIds.get(page.id);
      if (!id) continue;
      if (existing.get(page.id) && mode === 'skip') continue;
      const parentId = parentExt ? (dbIds.get(parentExt) ?? null) : null;
      await this.prisma.kbPage.update({ where: { id }, data: { parentId } });
    }

    return { created, updated, skipped, assetsCopied: [...copied.values()].filter(Boolean).length, needsReview };
  }

  /** Скопировать ассет из архива в /uploads/kb (мемоизировано). null — файла нет в архиве. */
  private copyAsset(parsed: B24Export, fileId: string, copied: Map<string, string | null>): string | null {
    if (copied.has(fileId)) return copied.get(fileId)!;
    const src = join(parsed.filesDir, fileId);
    if (!existsSync(src)) {
      copied.set(fileId, null);
      return null;
    }
    const name = parsed.fileNames[fileId] ?? fileId;
    const safe = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(-80);
    const fileName = `${fileId}-${safe}`;
    copyFileSync(src, join(this.uploadsDir, fileName));
    const url = `/uploads/kb/${fileName}`;
    copied.set(fileId, url);
    return url;
  }

  private async ensureBase(tenantId: string, parsed: B24Export) {
    const slug = kbSlugify(parsed.siteCode || parsed.siteTitle);
    const found = await this.prisma.kbBase.findFirst({ where: { tenantId, slug } });
    if (found) return found;
    return this.prisma.kbBase.create({ data: { tenantId, name: parsed.siteTitle, slug } });
  }

  private async existingByExternalId(tenantId: string, parsed: B24Export) {
    const rows = await this.prisma.kbPage.findMany({
      where: { tenantId, externalId: { in: parsed.pages.map((p) => p.id) } },
      select: { id: true, externalId: true, shortId: true },
    });
    return new Map(rows.map((r) => [r.externalId!, { id: r.id, shortId: r.shortId }]));
  }

  /** Отчёт dry-run: маппим все страницы без копирования ассетов и записи в БД. */
  private buildReport(parsed: B24Export, existing: Map<string, { id: string; shortId: string }>): DryRunReport {
    const parents = buildTree(parsed.pages, parsed.indexLandingId);
    const usedFiles = new Set<string>();
    let assetsMissing = 0;
    const ctx: MapContext = {
      resolveLink: (landingId) => (parsed.pages.some((p) => p.id === landingId) ? `kb:preview` : null),
      resolveAsset: (fileId) => {
        if (!existsSync(join(parsed.filesDir, fileId))) {
          assetsMissing += 1;
          return null;
        }
        usedFiles.add(fileId);
        return `/uploads/kb/preview`;
      },
    };
    let images = 0;
    let videos = 0;
    let unresolvedLinks = 0;
    const needsReview: DryRunReport['needsReview'] = [];
    for (const page of parsed.pages) {
      const mapped = mapB24Page(page, ctx, parsed.fileNames);
      images += mapped.blocks.filter((b) => b.type === 'image').length;
      videos += mapped.blocks.filter((b) => b.type === 'video').length;
      unresolvedLinks += mapped.unresolvedLinks;
      if (mapped.unknownBlocks.length > 0) needsReview.push({ title: page.title, details: mapped.unknownBlocks });
    }
    return {
      baseName: parsed.siteTitle,
      baseSlug: kbSlugify(parsed.siteCode || parsed.siteTitle),
      pagesTotal: parsed.pages.length,
      pagesNew: parsed.pages.filter((p) => !existing.has(p.id)).length,
      pagesExisting: parsed.pages.filter((p) => existing.has(p.id)).length,
      assetsUsed: usedFiles.size,
      assetsMissing,
      images,
      videos,
      unresolvedLinks,
      needsReview,
      tree: this.reportTree(parsed.pages, parents, existing),
    };
  }

  /** BFS-порядок: сначала корни (главная — первой), затем уровни по порядку ссылок. */
  private bfsOrder(pages: B24Page[], parents: Map<string, string | null>): B24Page[] {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const children = new Map<string | null, string[]>();
    for (const p of pages) {
      const parent = parents.get(p.id) ?? null;
      const list = children.get(parent) ?? [];
      list.push(p.id);
      children.set(parent, list);
    }
    const out: B24Page[] = [];
    const queue = [...(children.get(null) ?? [])];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(byId.get(id)!);
      queue.push(...(children.get(id) ?? []));
    }
    for (const p of pages) if (!seen.has(p.id)) out.push(p);
    return out;
  }

  private reportTree(pages: B24Page[], parents: Map<string, string | null>, existing: Map<string, unknown>): ImportTreeNode[] {
    const children = new Map<string | null, B24Page[]>();
    for (const p of pages) {
      const parent = parents.get(p.id) ?? null;
      const list = children.get(parent) ?? [];
      list.push(p);
      children.set(parent, list);
    }
    const toNode = (p: B24Page, depth: number): ImportTreeNode => ({
      externalId: p.id,
      title: p.title,
      exists: existing.has(p.id),
      children: depth >= 6 ? [] : (children.get(p.id) ?? []).map((c) => toNode(c, depth + 1)),
    });
    return (children.get(null) ?? []).map((p) => toNode(p, 0));
  }

  private gcSessions() {
    const now = Date.now();
    for (const [token, s] of this.sessions) {
      if (s.expiresAt < now) {
        rmSync(s.dir, { recursive: true, force: true });
        this.sessions.delete(token);
      }
    }
  }
}
