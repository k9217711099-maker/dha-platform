import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AclLevel, SecretTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { AclService, allows, resolveChain, type AclActor } from '../acl/acl.service.js';

export interface SecretInput {
  name?: string;
  login?: string | null;
  url?: string | null;
  comment?: string | null;
  tags?: string[];
  password?: string;
  responsibleId?: string | null;
}

/** Публичная форма секрета: без шифротекста и тем более без пароля. */
const SECRET_SELECT = {
  id: true, name: true, login: true, url: true, comment: true, tags: true,
  responsibleId: true, rotatedAt: true, createdAt: true, updatedAt: true,
} as const;

/**
 * Модуль «Секреты» (KB-DRIVE-TZ.md §8): пароли внешних кабинетов в шифрованном
 * хранилище (AES-256-GCM, ключ вне БД), журнал каждого раскрытия, ACL по общей
 * модели §2 и офбординг: увольнение сотрудника → авто-задачи на ротацию всех
 * секретов, к которым он имел доступ или которые просматривал.
 */
@Injectable()
export class SecretsService {
  private readonly log = new Logger(SecretsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly acl: AclService,
  ) {}

  // ─── CRUD ───

  async list(tenantId: string, actor: AclActor) {
    const secrets = await this.prisma.secret.findMany({
      where: { tenantId },
      select: { ...SECRET_SELECT, _count: { select: { views: true, tasks: { where: { status: SecretTaskStatus.OPEN } } } } },
      orderBy: { name: 'asc' },
    });
    if (this.acl.bypasses(actor, 'secret')) return secrets;
    const [entries, subjects] = await Promise.all([this.acl.entriesByTypes(tenantId, ['secret']), this.acl.subjectsOf(actor)]);
    return secrets.filter((s) => allows(resolveChain([entries.get(`secret:${s.id}`) ?? []], subjects), AclLevel.VIEWER));
  }

  async create(tenantId: string, dto: SecretInput, actorId: string) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Укажите название секрета');
    if (!dto.password) throw new BadRequestException('Укажите пароль/ключ');
    const secret = await this.prisma.secret.create({
      data: {
        tenantId,
        name,
        login: dto.login?.trim() || null,
        url: dto.url?.trim() || null,
        comment: dto.comment?.trim() || null,
        tags: dto.tags ?? [],
        cipher: this.crypto.encryptPii(dto.password),
        responsibleId: dto.responsibleId || null,
        rotatedAt: new Date(),
        createdById: actorId,
      },
      select: SECRET_SELECT,
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'secret', entityId: secret.id, payload: { name } });
    return secret;
  }

  async update(tenantId: string, id: string, dto: SecretInput, actorId: string) {
    await this.getOwn(tenantId, id);
    const secret = await this.prisma.secret.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.login !== undefined ? { login: dto.login?.trim() || null } : {}),
        ...(dto.url !== undefined ? { url: dto.url?.trim() || null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment?.trim() || null } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.responsibleId !== undefined ? { responsibleId: dto.responsibleId || null } : {}),
        ...(dto.password ? { cipher: this.crypto.encryptPii(dto.password), rotatedAt: new Date() } : {}),
      },
      select: SECRET_SELECT,
    });
    await this.audit.record({
      tenantId, actorId, action: dto.password ? 'rotated' : 'updated', entity: 'secret', entityId: id,
      payload: { name: secret.name, passwordChanged: Boolean(dto.password) },
    });
    return secret;
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const secret = await this.getOwn(tenantId, id);
    await this.prisma.$transaction([
      this.prisma.aclEntry.deleteMany({ where: { tenantId, resourceType: 'secret', resourceId: id } }),
      this.prisma.secret.delete({ where: { id } }), // журнал и задачи каскадом
    ]);
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'secret', entityId: id, payload: { name: secret.name } });
    return { ok: true };
  }

  // ─── Раскрытие пароля (журналируется каждое, §8) ───

  async reveal(tenantId: string, id: string, actor: AclActor) {
    const secret = await this.getOwn(tenantId, id);
    if (!this.acl.bypasses(actor, 'secret')) {
      const resolved = await this.acl.resolve(tenantId, actor, [{ type: 'secret', id }]);
      if (!allows(resolved, AclLevel.VIEWER)) throw new ForbiddenException('Нет доступа к этому секрету');
    }
    await this.prisma.secretView.create({ data: { secretId: id, userId: actor.adminId } });
    await this.audit.record({ tenantId, actorId: actor.adminId, action: 'revealed', entity: 'secret', entityId: id, payload: { name: secret.name } });
    return { password: this.crypto.decryptPii(secret.cipher) };
  }

  async views(tenantId: string, id: string) {
    await this.getOwn(tenantId, id);
    const rows = await this.prisma.secretView.findMany({ where: { secretId: id }, orderBy: { at: 'desc' }, take: 100 });
    const users = await this.prisma.adminUser.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    return rows.map((r) => ({ id: r.id, userId: r.userId, userName: byId.get(r.userId) ?? r.userId, at: r.at }));
  }

  // ─── Офбординг: авто-задачи на ротацию (§8) ───

  /**
   * Вызывается при отключении сотрудника. Собирает секреты, к которым он имел
   * доступ (ACL/право раздела) или которые раскрывал, и заводит задачи ротации
   * ответственным. Возвращает число созданных задач.
   */
  async onEmployeeOffboarded(tenantId: string, userId: string, actorId?: string): Promise<number> {
    const user = await this.prisma.adminUser.findFirst({ where: { id: userId, tenantId } });
    if (!user) return 0;
    const role = user.roleKey ? await this.prisma.role.findUnique({ where: { key: user.roleKey } }) : null;
    const perms = role?.permissions ?? [];
    const offActor: AclActor = { adminId: userId, roleKey: user.roleKey, perms };

    const secrets = await this.prisma.secret.findMany({ where: { tenantId }, select: { id: true, name: true, responsibleId: true } });
    if (secrets.length === 0) return 0;

    const hadSectionAccess = perms.includes('secrets_view') || perms.includes('secrets_manage');
    const [entries, subjects, viewedRows] = await Promise.all([
      this.acl.entriesByTypes(tenantId, ['secret']),
      this.acl.subjectsOf(offActor),
      this.prisma.secretView.findMany({ where: { userId }, select: { secretId: true }, distinct: ['secretId'] }),
    ]);
    const viewed = new Set(viewedRows.map((v) => v.secretId));

    const targets = secrets.filter((s) => {
      if (viewed.has(s.id)) return true; // раскрывал пароль — ротация обязательна
      const resolved = resolveChain([entries.get(`secret:${s.id}`) ?? []], subjects);
      // «имел доступ»: явный грант, либо секрет без грантов при праве раздела
      return resolved === 'default' ? hadSectionAccess : allows(resolved, AclLevel.VIEWER);
    });
    if (targets.length === 0) return 0;

    const open = await this.prisma.secretRotationTask.findMany({
      where: { tenantId, status: SecretTaskStatus.OPEN, secretId: { in: targets.map((t) => t.id) } },
      select: { secretId: true },
    });
    const alreadyOpen = new Set(open.map((t) => t.secretId));
    const toCreate = targets.filter((t) => !alreadyOpen.has(t.id));
    if (toCreate.length > 0) {
      await this.prisma.secretRotationTask.createMany({
        data: toCreate.map((t) => ({
          tenantId,
          secretId: t.id,
          reason: 'offboarding',
          offboardedUserId: userId,
          assigneeId: t.responsibleId ?? actorId ?? null,
        })),
      });
      await this.audit.record({
        tenantId, actorId, action: 'offboarding_rotation', entity: 'secret', entityId: userId,
        payload: { offboardedUser: user.email, tasksCreated: toCreate.length, secrets: toCreate.map((t) => t.name) },
      });
      this.log.warn(`Офбординг ${user.email}: создано задач на ротацию секретов — ${toCreate.length}`);
    }
    return toCreate.length;
  }

  async tasks(tenantId: string, actor: AclActor, status?: SecretTaskStatus) {
    const mine = this.acl.bypasses(actor, 'secret') ? {} : { assigneeId: actor.adminId };
    const rows = await this.prisma.secretRotationTask.findMany({
      where: { tenantId, ...(status ? { status } : {}), ...mine },
      include: { secret: { select: { id: true, name: true, login: true, url: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const userIds = [...new Set(rows.flatMap((r) => [r.offboardedUserId, r.assigneeId].filter(Boolean) as string[]))];
    const users = await this.prisma.adminUser.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    return rows.map((r) => ({
      id: r.id, status: r.status, reason: r.reason, createdAt: r.createdAt, closedAt: r.closedAt,
      secret: r.secret,
      offboardedUser: r.offboardedUserId ? (byId.get(r.offboardedUserId) ?? r.offboardedUserId) : null,
      assignee: r.assigneeId ? (byId.get(r.assigneeId) ?? r.assigneeId) : null,
      assigneeId: r.assigneeId,
    }));
  }

  /** Закрыть задачу: с новым паролем (ротация выполнена) либо отклонить с причиной. */
  async closeTask(tenantId: string, taskId: string, dto: { newPassword?: string; dismiss?: boolean }, actor: AclActor) {
    const task = await this.prisma.secretRotationTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.status !== SecretTaskStatus.OPEN) throw new BadRequestException('Задача уже закрыта');
    if (!this.acl.bypasses(actor, 'secret') && task.assigneeId !== actor.adminId) {
      throw new ForbiddenException('Задача назначена другому сотруднику');
    }
    if (!dto.dismiss && !dto.newPassword) throw new BadRequestException('Укажите новый пароль или отклоните задачу');

    if (dto.newPassword) {
      await this.prisma.secret.update({
        where: { id: task.secretId },
        data: { cipher: this.crypto.encryptPii(dto.newPassword), rotatedAt: new Date() },
      });
    }
    const closed = await this.prisma.secretRotationTask.update({
      where: { id: taskId },
      data: { status: dto.dismiss ? SecretTaskStatus.DISMISSED : SecretTaskStatus.DONE, closedAt: new Date(), closedById: actor.adminId },
    });
    await this.audit.record({
      tenantId, actorId: actor.adminId, action: dto.dismiss ? 'rotation_dismissed' : 'rotation_done',
      entity: 'secret', entityId: task.secretId, payload: { taskId },
    });
    return closed;
  }

  private async getOwn(tenantId: string, id: string) {
    const secret = await this.prisma.secret.findFirst({ where: { id, tenantId } });
    if (!secret) throw new NotFoundException('Секрет не найден');
    return secret;
  }
}
