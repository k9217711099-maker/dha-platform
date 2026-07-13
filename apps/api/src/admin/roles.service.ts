import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { ALL_PERMISSION_KEYS, DEFAULT_ROLES, PERMISSIONS } from './permissions.js';

const USER_SELECT = { id: true, email: true, name: true, roleKey: true, active: true } as const;
/** Ключи системных (сидируемых) ролей — их нельзя удалять/переименовывать ключ. */
const SYSTEM_ROLE_KEYS = new Set(DEFAULT_ROLES.map((r) => r.key));

/** Слаг латиницей из названия для ключа кастомной роли. */
function slugify(name: string): string {
  const map: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const s = name.toLowerCase().split('').map((ch) => map[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'role';
}

/** Роли доступа и админ-пользователи. Роли сидируются при первом запуске. */
@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly secrets: SecretsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Синк системных ролей БЕЗ разрушения кастомизаций админа (иначе рестарт «сбрасывает» права,
    // выданные вручную — напр. доступ к операциям у сотрудника, — и задачи «перестают отображаться»).
    // Правило: superadmin — всегда все права; остальные системные роли получают ОБЪЕДИНЕНИЕ
    // (добавляем новые дефолтные права по мере роста продукта, но НИКОГДА не убираем добавленные админом).
    const existing = await this.prisma.role.findMany({ where: { key: { in: DEFAULT_ROLES.map((r) => r.key) } } });
    const byKey = new Map(existing.map((e) => [e.key, e]));
    for (const r of DEFAULT_ROLES) {
      const cur = byKey.get(r.key);
      if (!cur) {
        await this.prisma.role.create({ data: { key: r.key, name: r.name, permissions: r.key === 'superadmin' ? [...ALL_PERMISSION_KEYS] : r.permissions } });
        continue;
      }
      if (r.key === 'superadmin') {
        if (cur.permissions.length !== ALL_PERMISSION_KEYS.length) {
          await this.prisma.role.update({ where: { key: r.key }, data: { permissions: [...ALL_PERMISSION_KEYS] } });
        }
        continue;
      }
      // Объединение: добавляем недостающие дефолтные права, сохраняя кастомные.
      const merged = [...new Set([...cur.permissions, ...r.permissions])];
      if (merged.length !== cur.permissions.length) {
        await this.prisma.role.update({ where: { key: r.key }, data: { permissions: merged } });
      }
    }
    // Миграция учёток без roleKey из enum role
    await this.prisma.adminUser.updateMany({ where: { roleKey: null, role: 'ADMIN' }, data: { roleKey: 'superadmin' } });
    await this.prisma.adminUser.updateMany({ where: { roleKey: null, role: 'MANAGER' }, data: { roleKey: 'manager' } });
  }

  permissionsCatalog() {
    return PERMISSIONS.map((p) => ({ ...p }));
  }

  async list() {
    const roles = await this.prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
    return roles.map((r) => ({ ...r, system: SYSTEM_ROLE_KEYS.has(r.key) }));
  }

  /** Создать кастомную роль (конструктор ролей, §11). Ключ генерируется из названия. */
  async createRole(dto: { name: string; permissions?: string[] }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Укажите название роли');
    const base = `custom_${slugify(name)}`;
    let key = base;
    for (let i = 2; await this.prisma.role.findUnique({ where: { key } }); i++) key = `${base}_${i}`;
    const permissions = (dto.permissions ?? []).filter((p) => (ALL_PERMISSION_KEYS as readonly string[]).includes(p));
    const role = await this.prisma.role.create({ data: { key, name, permissions } });
    return { ...role, system: false };
  }

  /** Удалить кастомную роль. Системные и назначенные сотрудникам роли удалять нельзя. */
  async deleteRole(key: string) {
    if (SYSTEM_ROLE_KEYS.has(key)) throw new BadRequestException('Системную роль удалить нельзя');
    const role = await this.prisma.role.findUnique({ where: { key } });
    if (!role) throw new NotFoundException('Роль не найдена');
    const inUse = await this.prisma.adminUser.count({ where: { roleKey: key } });
    if (inUse > 0) throw new BadRequestException(`Роль назначена сотрудникам (${inUse}). Сначала смените им роль.`);
    await this.prisma.role.delete({ where: { key } });
    return { ok: true };
  }

  /** Права роли по ключу (для токена и проверок). */
  async permissionsOf(roleKey: string | null): Promise<string[]> {
    const key = roleKey ?? 'manager';
    const role = await this.prisma.role.findUnique({ where: { key } });
    return role?.permissions ?? [];
  }

  update(key: string, dto: { name?: string; permissions?: string[] }) {
    return this.prisma.role.update({
      where: { key },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
      },
    });
  }

  /** Сотрудники с должностью, отделами и объектами (единая карточка «Сотрудники и оргструктура»). */
  async listUsers() {
    const users = await this.prisma.adminUser.findMany({
      select: { ...USER_SELECT, positionId: true, allowedAddressIds: true },
      orderBy: { createdAt: 'asc' },
    });
    const memberships = await this.prisma.userGroupMember.findMany({ select: { groupId: true, adminUserId: true } });
    const byUser = new Map<string, string[]>();
    for (const m of memberships) byUser.set(m.adminUserId, [...(byUser.get(m.adminUserId) ?? []), m.groupId]);
    return users.map((u) => ({ ...u, groupIds: byUser.get(u.id) ?? [] }));
  }

  async createUser(dto: { email: string; password: string; name?: string; roleKey?: string; positionId?: string; groupIds?: string[]; allowedAddressIds?: string[] }) {
    const tenantId = await this.tenant.getDefaultTenantId();
    // Роль: явная или по умолчанию у должности.
    let roleKey = dto.roleKey;
    if (!roleKey && dto.positionId) {
      const pos = await this.prisma.position.findFirst({ where: { id: dto.positionId, tenantId } });
      roleKey = pos?.defaultRoleKey ?? undefined;
    }
    if (!roleKey) throw new BadRequestException('Укажите роль (или должность с ролью по умолчанию)');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: {
        tenantId, email: dto.email, passwordHash, name: dto.name ?? null, roleKey, role: 'MANAGER',
        positionId: dto.positionId ?? null, allowedAddressIds: dto.allowedAddressIds ?? [],
      },
      select: { ...USER_SELECT, positionId: true, allowedAddressIds: true },
    });
    if (dto.groupIds?.length) {
      await this.prisma.userGroupMember.createMany({ data: dto.groupIds.map((groupId) => ({ groupId, adminUserId: user.id })), skipDuplicates: true });
    }
    return { ...user, groupIds: dto.groupIds ?? [] };
  }

  async updateUser(id: string, dto: { roleKey?: string; positionId?: string; groupIds?: string[]; allowedAddressIds?: string[]; active?: boolean; password?: string; name?: string; phone?: string; birthday?: string | null; hireDate?: string | null; hobby?: string; about?: string; customFields?: Record<string, string> }, actorId?: string) {
    const data: Prisma.AdminUserUpdateInput = {};
    if (dto.roleKey !== undefined) data.roleKey = dto.roleKey;
    if (dto.positionId !== undefined) data.position = dto.positionId ? { connect: { id: dto.positionId } } : { disconnect: true };
    if (dto.allowedAddressIds !== undefined) data.allowedAddressIds = dto.allowedAddressIds;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    // Карточка сотрудника (§6) — руководитель может править все поля.
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.hobby !== undefined) data.hobby = dto.hobby || null;
    if (dto.about !== undefined) data.about = dto.about || null;
    if (dto.birthday !== undefined) data.birthday = dto.birthday ? new Date(dto.birthday) : null;
    if (dto.hireDate !== undefined) data.hireDate = dto.hireDate ? new Date(dto.hireDate) : null;
    if (dto.customFields !== undefined) data.customFields = dto.customFields as Prisma.InputJsonValue;
    const before = dto.active === false ? await this.prisma.adminUser.findUnique({ where: { id }, select: { active: true, tenantId: true } }) : null;
    const updated = await this.prisma.adminUser.update({ where: { id }, data, select: { ...USER_SELECT, positionId: true, allowedAddressIds: true } });
    // Отделы (членство): полная замена, если переданы.
    if (dto.groupIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.userGroupMember.deleteMany({ where: { adminUserId: id } }),
        this.prisma.userGroupMember.createMany({ data: dto.groupIds.map((groupId) => ({ groupId, adminUserId: id })), skipDuplicates: true }),
      ]);
    }
    // Офбординг (KB-DRIVE-TZ.md §8): отключение сотрудника → авто-задачи на ротацию секретов
    if (before?.active === true && dto.active === false) {
      await this.secrets.onEmployeeOffboarded(before.tenantId, id, actorId).catch(() => undefined);
    }
    const groupIds = dto.groupIds ?? (await this.prisma.userGroupMember.findMany({ where: { adminUserId: id }, select: { groupId: true } })).map((m) => m.groupId);
    return { ...updated, groupIds };
  }

  // ── Должности (оргструктура) ───────────────────────────────────────────────
  async listPositions() {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.prisma.position.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  async createPosition(dto: { name: string; defaultRoleKey?: string }) {
    if (!dto.name?.trim()) throw new BadRequestException('Укажите название должности');
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.prisma.position.create({ data: { tenantId, name: dto.name.trim(), defaultRoleKey: dto.defaultRoleKey || null } });
  }
  async updatePosition(id: string, dto: { name?: string; defaultRoleKey?: string | null }) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const pos = await this.prisma.position.findFirst({ where: { id, tenantId } });
    if (!pos) throw new NotFoundException('Должность не найдена');
    return this.prisma.position.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        defaultRoleKey: dto.defaultRoleKey !== undefined ? (dto.defaultRoleKey || null) : undefined,
      },
    });
  }
  async deletePosition(id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const pos = await this.prisma.position.findFirst({ where: { id, tenantId } });
    if (!pos) throw new NotFoundException('Должность не найдена');
    await this.prisma.position.delete({ where: { id } }); // AdminUser.positionId → null (onDelete: SetNull)
    return { ok: true };
  }

  // ── Карточка сотрудника (§6) ────────────────────────────────────────────────
  private readonly CARD_SELECT = {
    id: true, email: true, name: true, roleKey: true, active: true, positionId: true,
    allowedAddressIds: true, avatarUrl: true, phone: true, birthday: true, hireDate: true, hobby: true, about: true, customFields: true,
  } as const;

  /** Полная карточка сотрудника: поля + отделы + определения пользовательских полей. */
  async getUserCard(id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const user = await this.prisma.adminUser.findFirst({ where: { id, tenantId }, select: this.CARD_SELECT });
    if (!user) throw new NotFoundException('Сотрудник не найден');
    const groupIds = (await this.prisma.userGroupMember.findMany({ where: { adminUserId: id }, select: { groupId: true } })).map((m) => m.groupId);
    return { ...user, groupIds, fieldDefs: await this.listFieldDefs() };
  }

  /** Пользовательские поля карточки (определения). */
  async listFieldDefs() {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.prisma.employeeFieldDef.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  }
  async createFieldDef(dto: { name?: string; editableBy?: 'SELF' | 'MANAGER' | 'BOTH' }) {
    const tenantId = await this.tenant.getDefaultTenantId();
    if (!dto.name?.trim()) throw new BadRequestException('Укажите название поля');
    const order = await this.prisma.employeeFieldDef.count({ where: { tenantId } });
    return this.prisma.employeeFieldDef.create({ data: { tenantId, name: dto.name.trim(), editableBy: dto.editableBy ?? 'MANAGER', order } });
  }
  async updateFieldDef(id: string, dto: { name?: string; editableBy?: 'SELF' | 'MANAGER' | 'BOTH' }) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const def = await this.prisma.employeeFieldDef.findFirst({ where: { id, tenantId } });
    if (!def) throw new NotFoundException('Поле не найдено');
    return this.prisma.employeeFieldDef.update({ where: { id }, data: { name: dto.name?.trim() || undefined, editableBy: dto.editableBy } });
  }
  async deleteFieldDef(id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const def = await this.prisma.employeeFieldDef.findFirst({ where: { id, tenantId } });
    if (!def) throw new NotFoundException('Поле не найдено');
    await this.prisma.employeeFieldDef.delete({ where: { id } });
    return { ok: true };
  }

  /** Установить фото сотрудника (руководитель или сам — проверка в контроллере). */
  async setPhoto(id: string, url: string) {
    await this.prisma.adminUser.update({ where: { id }, data: { avatarUrl: url } });
    return { avatarUrl: url };
  }

  /** Моя карточка (self-service): поля + какие пользовательские поля мне разрешено править. */
  async myProfile(userId: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id: userId }, select: this.CARD_SELECT });
    if (!user) throw new NotFoundException('Профиль не найден');
    const position = user.positionId ? await this.prisma.position.findUnique({ where: { id: user.positionId }, select: { name: true } }) : null;
    const groups = await this.prisma.userGroupMember.findMany({ where: { adminUserId: userId }, select: { groupId: true } });
    const groupNames = groups.length ? (await this.prisma.userGroup.findMany({ where: { id: { in: groups.map((g) => g.groupId) } }, select: { name: true } })).map((g) => g.name) : [];
    const role = user.roleKey ? await this.prisma.role.findUnique({ where: { key: user.roleKey }, select: { name: true } }) : null;
    const fieldDefs = await this.listFieldDefs();
    // Сам сотрудник видит все свои поля; править может только editableBy SELF|BOTH.
    return { ...user, positionName: position?.name ?? null, roleName: role?.name ?? null, groupNames, fieldDefs };
  }

  /** Обновление своей карточки: только «самозаполняемые» поля (телефон/ДР/хобби/о себе/фото + custom SELF|BOTH). §6 */
  async updateMyProfile(userId: string, dto: { phone?: string; birthday?: string | null; hobby?: string; about?: string; customFields?: Record<string, string> }) {
    const data: Prisma.AdminUserUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.hobby !== undefined) data.hobby = dto.hobby || null;
    if (dto.about !== undefined) data.about = dto.about || null;
    if (dto.birthday !== undefined) data.birthday = dto.birthday ? new Date(dto.birthday) : null;
    if (dto.customFields !== undefined) {
      // Разрешаем менять только поля SELF|BOTH; MANAGER-поля сохраняем прежними.
      const defs = await this.listFieldDefs();
      const selfEditable = new Set(defs.filter((d) => d.editableBy === 'SELF' || d.editableBy === 'BOTH').map((d) => d.id));
      const cur = (await this.prisma.adminUser.findUnique({ where: { id: userId }, select: { customFields: true } }))?.customFields as Record<string, string> | null;
      const merged: Record<string, string> = { ...(cur ?? {}) };
      for (const [k, v] of Object.entries(dto.customFields)) if (selfEditable.has(k)) merged[k] = v;
      data.customFields = merged as Prisma.InputJsonValue;
    }
    await this.prisma.adminUser.update({ where: { id: userId }, data });
    return this.myProfile(userId);
  }

  /** Публичный профиль коллеги (карточка из мессенджера): только «витринные» поля, без служебных. */
  async publicProfile(id: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, avatarUrl: true, phone: true, birthday: true, hobby: true, about: true, positionId: true, roleKey: true, lastSeenAt: true, active: true },
    });
    if (!user) throw new NotFoundException('Сотрудник не найден');
    const position = user.positionId ? await this.prisma.position.findUnique({ where: { id: user.positionId }, select: { name: true } }) : null;
    const role = user.roleKey ? await this.prisma.role.findUnique({ where: { key: user.roleKey }, select: { name: true } }) : null;
    const groups = await this.prisma.userGroupMember.findMany({ where: { adminUserId: id }, select: { groupId: true } });
    const groupNames = groups.length ? (await this.prisma.userGroup.findMany({ where: { id: { in: groups.map((g) => g.groupId) } }, select: { name: true } })).map((g) => g.name) : [];
    return {
      id: user.id,
      name: user.name?.trim() || user.email,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      birthday: user.birthday,
      hobby: user.hobby,
      about: user.about,
      positionName: position?.name ?? null,
      roleName: role?.name ?? null,
      groupNames,
      active: user.active,
      online: !!user.lastSeenAt && Date.now() - user.lastSeenAt.getTime() < 60_000,
    };
  }
}
