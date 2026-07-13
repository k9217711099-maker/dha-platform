import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DriveNodeKind, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { AclService, allows, resolveChain, type AclActor, type ResolvedAccess } from '../acl/acl.service.js';
import { AclLevel } from '@prisma/client';
import { newShortId } from '../kb/content.js';
import { extractText, MINDMAP_MIME } from './text-extract.js';

/** Корзина: автоочистка через 30 дней (§5.1). */
const TRASH_TTL_DAYS = 30;

const NODE_SELECT = {
  id: true, parentId: true, kind: true, name: true, shortId: true, mime: true,
  size: true, sha256: true, currentVersion: true, ownerId: true, deletedAt: true, updatedAt: true, createdAt: true,
} as const;

export type DriveNodeRow = Prisma.DriveNodeGetPayload<{ select: typeof NODE_SELECT }>;

/** Имя файла из multipart: браузеры шлют UTF-8, multer читает как latin1 — чиним кириллицу. */
export function fixUploadName(raw: string): string {
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    return decoded.includes('�') ? raw : decoded;
  } catch {
    return raw;
  }
}

/**
 * Диск (KB-DRIVE-TZ.md §5.1): папки/файлы, версии, корзина, скачивание через backend.
 * Тела файлов — в приватном каталоге `drive-files/` (НЕ раздаётся статикой: доступ
 * только через контроллер с проверкой прав; позже подменяется на S3 без смены контракта).
 */
@Injectable()
export class DriveService {
  private readonly log = new Logger(DriveService.name);
  private readonly dir = resolve(process.cwd(), 'drive-files');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acl: AclService,
  ) {
    mkdirSync(this.dir, { recursive: true });
  }

  // ─── ACL: «ближайший узел с грантами решает», наследование по папкам (§2) ───

  private async nodeAccessResolver(tenantId: string, actor: AclActor | undefined): Promise<(nodeId: string | null) => ResolvedAccess> {
    if (!actor || this.acl.bypasses(actor, 'drive_node')) return () => 'default';
    const [nodes, entries, subjects] = await Promise.all([
      this.prisma.driveNode.findMany({ where: { tenantId }, select: { id: true, parentId: true } }),
      this.acl.entriesByTypes(tenantId, ['drive_node']),
      this.acl.subjectsOf(actor),
    ]);
    if (entries.size === 0) return () => 'default';
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const memo = new Map<string, ResolvedAccess>();
    const resolve = (nodeId: string | null): ResolvedAccess => {
      if (nodeId === null) return 'default'; // корень Диска грантов не имеет
      const cached = memo.get(nodeId);
      if (cached !== undefined) return cached;
      const node = byId.get(nodeId);
      if (!node) return 'default';
      const own = entries.get(`drive_node:${nodeId}`) ?? [];
      const res: ResolvedAccess = own.length > 0 ? resolveChain([own], subjects) : resolve(node.parentId);
      memo.set(nodeId, res);
      return res;
    };
    return resolve;
  }

  private async requireNodeAccess(tenantId: string, actor: AclActor | undefined, nodeId: string | null, level: AclLevel) {
    if (!actor) return;
    const resolve = await this.nodeAccessResolver(tenantId, actor);
    if (!allows(resolve(nodeId), level)) {
      throw new NotFoundException('Объект не найден'); // не раскрываем существование закрытых объектов
    }
  }

  // ─── Просмотр ───

  /** Содержимое папки (parentId=null — корень) + хлебные крошки. */
  async list(tenantId: string, parentId: string | null, actor?: AclActor) {
    if (parentId) await this.getAlive(tenantId, parentId, DriveNodeKind.FOLDER);
    await this.requireNodeAccess(tenantId, actor, parentId, AclLevel.VIEWER);
    let nodes = await this.prisma.driveNode.findMany({
      where: { tenantId, parentId, deletedAt: null },
      select: NODE_SELECT,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }], // FILE < FOLDER по алфавиту enum — ниже пересортируем
    });
    if (actor) {
      const resolve = await this.nodeAccessResolver(tenantId, actor);
      nodes = nodes.filter((n) => allows(resolve(n.id), AclLevel.VIEWER));
    }
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ru') : a.kind === DriveNodeKind.FOLDER ? -1 : 1));
    return { nodes, breadcrumbs: await this.breadcrumbs(tenantId, parentId) };
  }

  private async breadcrumbs(tenantId: string, id: string | null) {
    const chain: { id: string; name: string }[] = [];
    let cursor = id;
    for (let depth = 0; cursor && depth < 50; depth++) {
      const node: { id: string; name: string; parentId: string | null } | null = await this.prisma.driveNode.findFirst({
        where: { id: cursor, tenantId },
        select: { id: true, name: true, parentId: true },
      });
      if (!node) break;
      chain.unshift({ id: node.id, name: node.name });
      cursor = node.parentId;
    }
    return chain;
  }

  /** Внутренняя ссылка /drive?d=<shortId> (§5.4). */
  async resolveShortId(tenantId: string, shortId: string, actor?: AclActor) {
    const node = await this.prisma.driveNode.findFirst({ where: { tenantId, shortId, deletedAt: null }, select: NODE_SELECT });
    if (!node) throw new NotFoundException('Объект не найден');
    await this.requireNodeAccess(tenantId, actor, node.id, AclLevel.VIEWER);
    return node;
  }

  /** Поиск по имени и содержимому (текст извлекается при загрузке, §4.1).
   *  Пословно с усечением окончаний — как фоллбэк поиска БЗ. ACL — до выдачи (§1.4). */
  async search(tenantId: string, q: string, actor?: AclActor) {
    const words = q
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .map((w) => (w.length >= 5 ? w.slice(0, Math.max(4, w.length - 2)) : w))
      .slice(0, 8);
    if (words.length === 0) return [];
    const wordCond = (w: string) => ({
      OR: [{ name: { contains: w, mode: 'insensitive' as const } }, { searchText: { contains: w, mode: 'insensitive' as const } }],
    });
    let found = await this.prisma.driveNode.findMany({
      where: { tenantId, deletedAt: null, AND: words.map(wordCond) },
      select: NODE_SELECT,
      take: 30,
      orderBy: { name: 'asc' },
    });
    if (found.length === 0 && words.length > 1) {
      found = await this.prisma.driveNode.findMany({
        where: { tenantId, deletedAt: null, OR: words.map(wordCond) },
        select: NODE_SELECT,
        take: 30,
        orderBy: { name: 'asc' },
      });
    }
    if (actor && found.length > 0) {
      const resolve = await this.nodeAccessResolver(tenantId, actor);
      found = found.filter((n) => allows(resolve(n.id), AclLevel.VIEWER));
    }
    return found;
  }

  // ─── Папки и операции ───

  async createFolder(tenantId: string, dto: { parentId?: string | null; name?: string }, actorId?: string, actor?: AclActor) {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.getAlive(tenantId, parentId, DriveNodeKind.FOLDER);
    await this.requireNodeAccess(tenantId, actor, parentId, AclLevel.EDITOR);
    const name = await this.uniqueName(tenantId, parentId, dto.name?.trim() || 'Новая папка');
    const node = await this.prisma.driveNode.create({
      data: { tenantId, parentId, kind: DriveNodeKind.FOLDER, name, shortId: newShortId(), ownerId: actorId ?? null },
      select: NODE_SELECT,
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'drive_folder', entityId: node.id, payload: { name } });
    return node;
  }

  async rename(tenantId: string, id: string, name: string, actorId?: string, actor?: AclActor) {
    const node = await this.getAlive(tenantId, id);
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.EDITOR);
    const clean = name.trim();
    if (!clean) throw new BadRequestException('Пустое имя');
    await this.assertFree(tenantId, node.parentId, clean, id);
    const updated = await this.prisma.driveNode.update({ where: { id }, data: { name: clean }, select: NODE_SELECT });
    await this.audit.record({ tenantId, actorId, action: 'renamed', entity: 'drive_node', entityId: id, payload: { from: node.name, to: clean } });
    return updated;
  }

  async move(tenantId: string, id: string, parentId: string | null, actorId?: string, actor?: AclActor) {
    const node = await this.getAlive(tenantId, id);
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.EDITOR);
    await this.requireNodeAccess(tenantId, actor, parentId, AclLevel.EDITOR);
    if (parentId) {
      await this.getAlive(tenantId, parentId, DriveNodeKind.FOLDER);
      let cursor: string | null = parentId;
      for (let depth = 0; cursor && depth < 50; depth++) {
        if (cursor === id) throw new BadRequestException('Нельзя переместить папку внутрь неё самой');
        const p: { parentId: string | null } | null = await this.prisma.driveNode.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = p?.parentId ?? null;
      }
    }
    await this.assertFree(tenantId, parentId, node.name, id);
    const updated = await this.prisma.driveNode.update({ where: { id }, data: { parentId }, select: NODE_SELECT });
    await this.audit.record({ tenantId, actorId, action: 'moved', entity: 'drive_node', entityId: id, payload: { to: parentId } });
    return updated;
  }

  // ─── Загрузка и версии ───

  /** Загрузка файла: то же имя в той же папке → новая версия (§5.1). */
  async upload(tenantId: string, parentId: string | null, file: Express.Multer.File, actorId?: string, actor?: AclActor) {
    if (parentId) await this.getAlive(tenantId, parentId, DriveNodeKind.FOLDER);
    await this.requireNodeAccess(tenantId, actor, parentId, AclLevel.EDITOR);
    const name = fixUploadName(file.originalname);
    const body = await readFile(file.path);
    await unlink(file.path).catch(() => undefined);
    const mime = file.mimetype || 'application/octet-stream';
    return this.storeVersion(tenantId, parentId, name, body, mime, actorId);
  }

  /** Занято места (сумма всех версий) и квота тенанта (env DRIVE_QUOTA_GB, 0 = безлимит). */
  async usage(tenantId: string): Promise<{ usedBytes: number; quotaBytes: number | null }> {
    const rows = await this.prisma.$queryRaw<{ sum: bigint | null }[]>`
      SELECT COALESCE(SUM(v.size), 0)::bigint AS sum
      FROM drive_file_versions v JOIN drive_nodes n ON n.id = v."nodeId"
      WHERE n."tenantId" = ${tenantId}`;
    const quotaGb = Number(process.env.DRIVE_QUOTA_GB ?? 0);
    return {
      usedBytes: Number(rows[0]?.sum ?? 0),
      quotaBytes: quotaGb > 0 ? quotaGb * 1024 * 1024 * 1024 : null,
    };
  }

  /** Записать тело файла: то же имя в папке → новая версия, иначе новый узел (§5.1). */
  private async storeVersion(tenantId: string, parentId: string | null, name: string, body: Buffer, mime: string, actorId?: string) {
    const { usedBytes, quotaBytes } = await this.usage(tenantId);
    if (quotaBytes !== null && usedBytes + body.length > quotaBytes) {
      throw new BadRequestException(
        `Квота Диска исчерпана: занято ${(usedBytes / 1024 ** 3).toFixed(1)} ГБ из ${(quotaBytes / 1024 ** 3).toFixed(0)} ГБ. Очистите корзину или увеличьте квоту.`,
      );
    }
    const sha256 = createHash('sha256').update(body).digest('hex');
    const existing = await this.prisma.driveNode.findFirst({
      where: { tenantId, parentId, name, kind: DriveNodeKind.FILE, deletedAt: null },
    });
    const node = existing
      ? existing
      : await this.prisma.driveNode.create({
          data: { tenantId, parentId, kind: DriveNodeKind.FILE, name, shortId: newShortId(), ownerId: actorId ?? null },
        });
    const n = (existing?.currentVersion ?? 0) + 1;

    mkdirSync(join(this.dir, node.id), { recursive: true });
    await writeFile(join(this.dir, node.id, String(n)), body);

    const searchText = await extractText(name, mime, body);
    const [updated] = await this.prisma.$transaction([
      this.prisma.driveNode.update({
        where: { id: node.id },
        data: { mime, size: body.length, sha256, currentVersion: n, searchText },
        select: NODE_SELECT,
      }),
      this.prisma.driveFileVersion.create({
        data: { nodeId: node.id, n, storageKey: `${node.id}/${n}`, size: body.length, sha256, mime, authorId: actorId ?? null },
      }),
    ]);
    await this.audit.record({
      tenantId, actorId, action: existing ? 'new_version' : 'uploaded', entity: 'drive_file', entityId: node.id,
      payload: { name, size: body.length, version: n },
    });
    return updated;
  }

  // ─── Ментальные карты (.dmap, ТЗ §5.5) и текстовый контент ───

  /** Новая ментальная карта в папке: файл .dmap с корневым узлом. */
  async createMindmap(tenantId: string, dto: { parentId?: string | null; name?: string }, actorId?: string, actor?: AclActor) {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.getAlive(tenantId, parentId, DriveNodeKind.FOLDER);
    await this.requireNodeAccess(tenantId, actor, parentId, AclLevel.EDITOR);
    const title = dto.name?.trim() || 'Новая карта';
    const name = await this.uniqueName(tenantId, parentId, title.endsWith('.dmap') ? title : `${title}.dmap`);
    const data = { nodeData: { id: 'root', topic: name.replace(/\.dmap$/, ''), children: [] } };
    return this.storeVersion(tenantId, parentId, name, Buffer.from(JSON.stringify(data), 'utf8'), MINDMAP_MIME, actorId);
  }

  /** Текстовый контент файла для встроенных редакторов (карты, заметки). */
  async getTextContent(tenantId: string, id: string, actor?: AclActor) {
    const node = await this.getFile(tenantId, id);
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.VIEWER);
    if ((node.size ?? 0) > 5 * 1024 * 1024) throw new BadRequestException('Файл слишком большой для встроенного редактора');
    const v = await this.prisma.driveFileVersion.findUnique({ where: { nodeId_n: { nodeId: id, n: node.currentVersion } } });
    if (!v) throw new NotFoundException('Версия не найдена');
    const body = await readFile(join(this.dir, v.storageKey));
    return { id: node.id, name: node.name, mime: node.mime, version: node.currentVersion, content: body.toString('utf8') };
  }

  /** Сохранение из встроенного редактора → новая версия того же файла. */
  async saveTextContent(tenantId: string, id: string, content: string, actorId?: string, actor?: AclActor) {
    const node = await this.getFile(tenantId, id);
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.EDITOR);
    if (content.length > 5 * 1024 * 1024) throw new BadRequestException('Слишком большой контент');
    return this.storeVersion(tenantId, node.parentId, node.name, Buffer.from(content, 'utf8'), node.mime ?? 'text/plain', actorId);
  }

  /** Сохранение из WOPI (PutFile Collabora): права уже проверены при выдаче токена. */
  async saveBinaryContent(tenantId: string, id: string, body: Buffer, actorId?: string) {
    const node = await this.getFile(tenantId, id);
    return this.storeVersion(tenantId, node.parentId, node.name, body, node.mime ?? 'application/octet-stream', actorId);
  }

  /** Проверка ACL для выдачи WOPI-токена (вызывает контроллер edit-session). */
  async canAccess(tenantId: string, actor: AclActor, nodeId: string, level: AclLevel): Promise<boolean> {
    const resolve = await this.nodeAccessResolver(tenantId, actor);
    return allows(resolve(nodeId), level);
  }

  async versions(tenantId: string, id: string, actor?: AclActor) {
    await this.getFile(tenantId, id);
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.VIEWER);
    return this.prisma.driveFileVersion.findMany({
      where: { nodeId: id },
      orderBy: { n: 'desc' },
      select: { id: true, n: true, size: true, mime: true, sha256: true, authorId: true, createdAt: true },
    });
  }

  /** Данные для стриминга файла контроллером (актуальная или конкретная версия).
   *  actor не передаётся публичными ссылками — явная публикация обходит ACL (§5.4). */
  async fileStream(tenantId: string, id: string, versionN?: number, actor?: AclActor) {
    const node = await this.getFile(tenantId, id, { includeDeleted: true });
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.VIEWER);
    const n = versionN ?? node.currentVersion;
    const v = await this.prisma.driveFileVersion.findUnique({ where: { nodeId_n: { nodeId: id, n } } });
    if (!v) throw new NotFoundException('Версия не найдена');
    const path = join(this.dir, v.storageKey);
    if (!existsSync(path)) throw new NotFoundException('Файл отсутствует в хранилище');
    return { stream: createReadStream(path), name: node.name, mime: v.mime, size: v.size };
  }

  // ─── Корзина ───

  async remove(tenantId: string, id: string, actorId?: string, actor?: AclActor) {
    const node = await this.getAlive(tenantId, id);
    await this.requireNodeAccess(tenantId, actor, id, AclLevel.EDITOR);
    const ids = [id, ...(await this.descendantIds(tenantId, id))];
    await this.prisma.driveNode.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    await this.audit.record({ tenantId, actorId, action: 'trashed', entity: 'drive_node', entityId: id, payload: { name: node.name, withChildren: ids.length - 1 } });
    return { ok: true, trashed: ids.length };
  }

  /** Корзина: корни удалённых поддеревьев (родитель жив или отсутствует). */
  async trash(tenantId: string) {
    const deleted = await this.prisma.driveNode.findMany({
      where: { tenantId, deletedAt: { not: null } },
      select: { ...NODE_SELECT, parent: { select: { deletedAt: true } } },
      orderBy: { deletedAt: 'desc' },
    });
    return deleted.filter((n) => !n.parent || n.parent.deletedAt === null).map(({ parent: _p, ...rest }) => rest);
  }

  async restore(tenantId: string, id: string, actorId?: string) {
    const node = await this.prisma.driveNode.findFirst({ where: { id, tenantId, deletedAt: { not: null } }, include: { parent: true } });
    if (!node) throw new NotFoundException('Объект не найден в корзине');
    const ids = [id, ...(await this.descendantIds(tenantId, id))];
    await this.prisma.driveNode.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
    // Родитель тоже в корзине/удалён — поднимаем в корень
    if (node.parent && node.parent.deletedAt !== null) {
      await this.prisma.driveNode.update({ where: { id }, data: { parentId: null } });
    }
    await this.audit.record({ tenantId, actorId, action: 'restored', entity: 'drive_node', entityId: id, payload: { name: node.name } });
    return { ok: true, restored: ids.length };
  }

  /** Окончательное удаление (только из корзины): БД + тела файлов. */
  async purge(tenantId: string, id: string, actorId?: string) {
    const node = await this.prisma.driveNode.findFirst({ where: { id, tenantId, deletedAt: { not: null } } });
    if (!node) throw new NotFoundException('Объект не найден в корзине');
    const ids = [id, ...(await this.descendantIds(tenantId, id))];
    await this.prisma.publicLink.deleteMany({ where: { tenantId, resourceType: 'drive_file', resourceId: { in: ids } } });
    await this.prisma.driveNode.deleteMany({ where: { id: { in: ids } } }); // версии каскадом
    for (const nid of ids) rmSync(join(this.dir, nid), { recursive: true, force: true });
    await this.audit.record({ tenantId, actorId, action: 'purged', entity: 'drive_node', entityId: id, payload: { name: node.name, count: ids.length } });
    return { ok: true, purged: ids.length };
  }

  /** Автоочистка корзины: раз в сутки удаляем всё старше 30 дней. */
  @Cron('0 30 4 * * *')
  async purgeExpired() {
    const threshold = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 3600 * 1000);
    const expired = await this.prisma.driveNode.findMany({
      where: { deletedAt: { lt: threshold } },
      select: { id: true },
    });
    if (expired.length === 0) return;
    const ids = expired.map((n) => n.id);
    await this.prisma.publicLink.deleteMany({ where: { resourceType: 'drive_file', resourceId: { in: ids } } });
    await this.prisma.driveNode.deleteMany({ where: { id: { in: ids } } });
    for (const nid of ids) rmSync(join(this.dir, nid), { recursive: true, force: true });
    this.log.log(`Корзина: удалено окончательно ${ids.length} объектов старше ${TRASH_TTL_DAYS} дней`);
  }

  // ─── Помощники ───

  private async getAlive(tenantId: string, id: string, kind?: DriveNodeKind) {
    const node = await this.prisma.driveNode.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!node || (kind && node.kind !== kind)) {
      throw new NotFoundException(kind === DriveNodeKind.FOLDER ? 'Папка не найдена' : 'Объект не найден');
    }
    return node;
  }

  async getFile(tenantId: string, id: string, opts: { includeDeleted?: boolean } = {}) {
    const node = await this.prisma.driveNode.findFirst({
      where: { id, tenantId, kind: DriveNodeKind.FILE, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    });
    if (!node) throw new NotFoundException('Файл не найден');
    return node;
  }

  private async assertFree(tenantId: string, parentId: string | null, name: string, exceptId?: string) {
    const clash = await this.prisma.driveNode.findFirst({
      where: { tenantId, parentId, name, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(`«${name}» уже есть в этой папке`);
  }

  private async uniqueName(tenantId: string, parentId: string | null, base: string): Promise<string> {
    let name = base;
    for (let i = 2; ; i++) {
      const clash = await this.prisma.driveNode.findFirst({ where: { tenantId, parentId, name, deletedAt: null }, select: { id: true } });
      if (!clash) return name;
      name = `${base} (${i})`;
    }
  }

  private async descendantIds(tenantId: string, rootId: string): Promise<string[]> {
    const all = await this.prisma.driveNode.findMany({ where: { tenantId }, select: { id: true, parentId: true } });
    const children = new Map<string, string[]>();
    for (const n of all) {
      if (!n.parentId) continue;
      const list = children.get(n.parentId) ?? [];
      list.push(n.id);
      children.set(n.parentId, list);
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
