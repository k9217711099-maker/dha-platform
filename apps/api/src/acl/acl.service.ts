import { ForbiddenException, Injectable } from '@nestjs/common';
import { AclLevel, type AclEntry } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

export type AclResourceType = 'kb_base' | 'kb_page' | 'drive_node' | 'secret';

/** Контекст сотрудника для проверки доступов (из JWT, проставляет контроллер). */
export interface AclActor {
  adminId: string;
  roleKey: string | null;
  perms: string[];
}

/** Порядок уровней: manager ⊃ editor ⊃ viewer. */
const LEVEL_RANK: Record<AclLevel, number> = { VIEWER: 1, EDITOR: 2, MANAGER: 3 };

/**
 * Результат резолва по цепочке узлов:
 * - 'default' — ни на одном узле цепочки грантов нет → действуют только RBAC-права раздела;
 * - AclLevel — ближайший узел с грантами дал доступ этого уровня;
 * - null — ближайший узел с грантами есть, но субъект не совпал → доступа нет.
 */
export type ResolvedAccess = AclLevel | 'default' | null;

/** Ключ субъекта гранта: user:<adminId> | role:<roleKey> | group:<groupId>. */
export function subjectKey(subjectType: string, subjectId: string): string {
  return `${subjectType}:${subjectId}`;
}

/**
 * Чистая логика «ближайший узел с грантами решает» (KB-DRIVE-TZ.md §2):
 * идём по цепочке от самого узла к корню; первый узел, где гранты вообще есть,
 * определяет доступ (совпал субъект — уровень, не совпал — отказ). Узлы без
 * грантов прозрачны (наследование).
 */
export function resolveChain(chain: AclEntry[][], subjects: Set<string>): ResolvedAccess {
  for (const entries of chain) {
    if (entries.length === 0) continue;
    let best: AclLevel | null = null;
    for (const e of entries) {
      if (!subjects.has(subjectKey(e.subjectType, e.subjectId))) continue;
      if (!best || LEVEL_RANK[e.level] > LEVEL_RANK[best]) best = e.level;
    }
    return best;
  }
  return 'default';
}

/** Достаточен ли резолв для требуемого уровня (default = разрешено, решает RBAC). */
export function allows(resolved: ResolvedAccess, required: AclLevel): boolean {
  if (resolved === 'default') return true;
  if (resolved === null) return false;
  return LEVEL_RANK[resolved] >= LEVEL_RANK[required];
}

/**
 * Точечные доступы поверх RBAC (KB-DRIVE-TZ.md §2). RBAC-право раздела (kb_view,
 * drive_view…) по-прежнему обязательно — ACL сужает или расширяет видимость внутри
 * раздела. Обладатели kb_manage / drive_manage видят всё в своём модуле (админ
 * раздела не может сам себя запереть).
 */
@Injectable()
export class AclService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ключи субъектов сотрудника: он сам, его роль, его группы. */
  async subjectsOf(actor: AclActor): Promise<Set<string>> {
    const memberships = await this.prisma.userGroupMember.findMany({
      where: { adminUserId: actor.adminId },
      select: { groupId: true },
    });
    const keys = new Set<string>([`user:${actor.adminId}`]);
    if (actor.roleKey) keys.add(`role:${actor.roleKey}`);
    for (const m of memberships) keys.add(`group:${m.groupId}`);
    return keys;
  }

  /** Полный обход ACL для модуля: kb_manage — БЗ, drive_manage — Диск, secrets_manage — Секреты. */
  bypasses(actor: AclActor, resourceType: AclResourceType): boolean {
    const perm = resourceType === 'drive_node' ? 'drive_manage' : resourceType === 'secret' ? 'secrets_manage' : 'kb_manage';
    return actor.perms.includes(perm);
  }

  /** Все гранты модулей тенанта одним запросом (таблица маленькая): ключ resourceType:resourceId. */
  async entriesByTypes(tenantId: string, types: AclResourceType[]): Promise<Map<string, AclEntry[]>> {
    const entries = await this.prisma.aclEntry.findMany({ where: { tenantId, resourceType: { in: types } } });
    const map = new Map<string, AclEntry[]>();
    for (const e of entries) {
      const key = `${e.resourceType}:${e.resourceId}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }

  /** Резолв доступа к одному ресурсу по его цепочке (узел первым, корень последним). */
  async resolve(
    tenantId: string,
    actor: AclActor,
    chainRefs: { type: AclResourceType; id: string }[],
  ): Promise<ResolvedAccess> {
    if (chainRefs.length > 0 && this.bypasses(actor, chainRefs[0]!.type)) return AclLevel.MANAGER;
    const map = await this.entriesByTypes(tenantId, [...new Set(chainRefs.map((r) => r.type))]);
    const subjects = await this.subjectsOf(actor);
    return resolveChain(chainRefs.map((r) => map.get(`${r.type}:${r.id}`) ?? []), subjects);
  }

  /** Проверка с исключением (для мутаций): недостаточно — 403. */
  async require(
    tenantId: string,
    actor: AclActor,
    chainRefs: { type: AclResourceType; id: string }[],
    required: AclLevel,
  ): Promise<void> {
    const resolved = await this.resolve(tenantId, actor, chainRefs);
    if (!allows(resolved, required)) {
      throw new ForbiddenException('Нет доступа к этому объекту (проверьте гранты в «Доступах»)');
    }
  }

  // ─── Управление грантами ───

  listEntries(tenantId: string, resourceType: AclResourceType, resourceId: string) {
    return this.prisma.aclEntry.findMany({
      where: { tenantId, resourceType, resourceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Полная замена грантов ресурса (PUT). */
  async setEntries(
    tenantId: string,
    resourceType: AclResourceType,
    resourceId: string,
    entries: { subjectType: string; subjectId: string; level: AclLevel }[],
  ) {
    const clean = entries.filter(
      (e) => ['user', 'role', 'group'].includes(e.subjectType) && e.subjectId && LEVEL_RANK[e.level],
    );
    await this.prisma.$transaction([
      this.prisma.aclEntry.deleteMany({ where: { tenantId, resourceType, resourceId } }),
      this.prisma.aclEntry.createMany({
        data: clean.map((e) => ({ tenantId, resourceType, resourceId, ...e })),
        skipDuplicates: true,
      }),
    ]);
    return this.listEntries(tenantId, resourceType, resourceId);
  }
}
