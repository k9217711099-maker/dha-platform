import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OpsTaskKind, OpsTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { OpsEvents } from './ops.events.js';
import type { ChangeStatusDto, CreateOpsTaskDto, UpdateOpsTaskDto } from './dto/ops.dto.js';

/** Кто смотрит/действует (из admin-JWT). Видимость: все / своя группа (roleKey) / только свои. */
export interface OpsViewer {
  id: string;
  roleKey: string | null;
  perms: string[];
}

/** Снапшот пункта чек-листа (OpsTaskChecklist.itemsSnapshot). */
export interface SnapshotItem {
  id: string;
  parentId: string | null;
  order: number;
  kind: 'HEADER' | 'ITEM' | 'SUBITEM';
  text: string;
  thirdOption: string | null;
  requirePhoto: boolean;
  excludeFromScore: boolean;
}

export const TASK_INCLUDE = {
  room: { select: { id: true, number: true, floor: true, roomTypeId: true, sectionId: true, dndUntil: true, cleanRequestedAt: true } },
  zone: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, color: true } },
  assignees: true,
  watchers: true,
  tags: { include: { tag: true } },
  checklists: { include: { answers: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.OpsTaskInclude;

const FULL_INCLUDE = {
  ...TASK_INCLUDE,
  comments: { orderBy: { createdAt: 'asc' as const } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  statusLog: { orderBy: { at: 'asc' as const } },
} satisfies Prisma.OpsTaskInclude;

/** Допустимые переходы статусов (§3.2). Reopen DONE/CANCELLED→NEW — только ops_manage.
 *  WAITING_CONFIRM — если задача с requireConfirmation: «готово» ведёт сюда, а установщик подтверждает → DONE. */
const TRANSITIONS: Record<OpsTaskStatus, OpsTaskStatus[]> = {
  PLAN: ['NEW', 'CANCELLED'],
  NEW: ['ACCEPTED', 'IN_PROGRESS', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'WAITING_CONFIRM', 'DONE', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'WAITING_CONFIRM', 'DONE', 'CANCELLED'],
  WAITING_CONFIRM: ['DONE', 'IN_PROGRESS', 'CANCELLED'],
  DONE: ['NEW'],
  CANCELLED: ['NEW'],
};

export interface ListFilters {
  kind?: OpsTaskKind;
  status?: OpsTaskStatus;
  statuses?: OpsTaskStatus[];
  propertyId?: string;
  roomId?: string;
  zoneId?: string;
  assigneeId?: string;
  groupId?: string;
  createdBy?: string;
  tagId?: string;
  tagIds?: string[];
  important?: boolean;
  overdue?: boolean;
  /** Тип привязки (§18): ADMIN — административные (без номера/зоны); LOCATED — на номер/зону. */
  target?: 'ADMIN' | 'LOCATED';
  recurring?: boolean;
  withChecklist?: boolean;
  q?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class OpsTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: OpsEvents,
  ) {}

  /** where-подмножество по видимости задач (§10): все / свой отдел / свои.
   *  «Свой отдел» = членство в UserGroup (оргструктура), а не роль-доступ (см. dha-org-structure).
   *
   *  Три уровня:
   *   • ops_view_all — видит всё;
   *   • базовый (даже без ops_view_group) — свои задачи (исполнитель/автор/наблюдатель/супервайзер)
   *     И задачи, АДРЕСОВАННЫЕ моему отделу (groupId ∈ мои отделы). Назначение на отдел = видно каждому его члену;
   *   • ops_view_group — дополнительно задачи КОЛЛЕГ по отделу (их личные назначения и созданные ими). */
  private async visibilityWhere(tenantId: string, viewer: OpsViewer): Promise<Prisma.OpsTaskWhereInput> {
    if (viewer.perms.includes('ops_view_all')) return {};
    const myGroups = await this.prisma.userGroupMember.findMany({ where: { adminUserId: viewer.id }, select: { groupId: true } });
    const groupIds = myGroups.map((m) => m.groupId);
    const or: Prisma.OpsTaskWhereInput[] = [
      { assignees: { some: { userId: viewer.id } } },
      { createdBy: viewer.id },
      { watchers: { some: { userId: viewer.id } } },
      { supervisorId: viewer.id },
    ];
    // Задача, адресованная моему отделу, видна мне всегда — даже без ops_view_group.
    if (groupIds.length) or.push({ groupId: { in: groupIds } });
    // ops_view_group — вижу и личные задачи коллег по отделу (весь участок).
    if (viewer.perms.includes('ops_view_group') && groupIds.length) {
      const members = await this.prisma.userGroupMember.findMany({ where: { groupId: { in: groupIds } }, select: { adminUserId: true } });
      const memberIds = [...new Set(members.map((m) => m.adminUserId))];
      or.push({ assignees: { some: { userId: { in: memberIds } } } }, { createdBy: { in: memberIds } });
    }
    return { OR: or };
  }

  async list(tenantId: string, viewer: OpsViewer, f: ListFilters = {}) {
    const vis = await this.visibilityWhere(tenantId, viewer);
    // Статус: мультивыбор (statuses) → in; иначе одиночный; «просроченные» без явного статуса — только активные.
    let statusWhere: Prisma.OpsTaskWhereInput['status'] = f.statuses?.length ? { in: f.statuses } : f.status;
    if (f.overdue && !statusWhere) statusWhere = { notIn: ['DONE', 'CANCELLED', 'PLAN'] };
    // Видимость + тип привязки (§18) собираем в AND, чтобы не конфликтовать с OR поиска.
    const and: Prisma.OpsTaskWhereInput[] = [vis];
    if (f.target === 'ADMIN') and.push({ roomId: null, zoneId: null });
    if (f.target === 'LOCATED') and.push({ OR: [{ roomId: { not: null } }, { zoneId: { not: null } }] });
    const where: Prisma.OpsTaskWhereInput = {
      tenantId,
      kind: f.kind,
      status: statusWhere,
      propertyId: f.propertyId,
      roomId: f.roomId,
      zoneId: f.zoneId,
      important: f.important ? true : undefined,
      createdBy: f.createdBy,
      assignees: f.assigneeId ? { some: { userId: f.assigneeId } } : undefined,
      groupId: f.groupId ?? undefined,
      tags: f.tagIds?.length ? { some: { tagId: { in: f.tagIds } } } : f.tagId ? { some: { tagId: f.tagId } } : undefined,
      recurringRuleId: f.recurring ? { not: null } : undefined,
      checklists: f.withChecklist ? { some: {} } : undefined,
      dueAt: f.overdue ? { lt: new Date() } : undefined,
      createdAt: f.from || f.to ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined } : undefined,
      ...(f.q
        ? { OR: [{ title: { contains: f.q, mode: 'insensitive' as const } }, { description: { contains: f.q, mode: 'insensitive' as const } }, { room: { number: { contains: f.q } } }] }
        : {}),
      AND: and,
    };
    const tasks = await this.prisma.opsTask.findMany({ where, include: TASK_INCLUDE, orderBy: [{ important: 'desc' }, { severity: 'desc' }, { lastActivityAt: 'desc' }], take: 500 });
    return this.attachUnread(tasks, viewer.id);
  }

  /** Непрочитанные комментарии для текущего смотрящего (после его lastReadAt; свои не считаются). */
  private async attachUnread<T extends { id: string }>(tasks: T[], userId: string): Promise<(T & { unread: number })[]> {
    if (tasks.length === 0) return [];
    const ids = tasks.map((t) => t.id);
    const [reads, comments] = await Promise.all([
      this.prisma.opsTaskRead.findMany({ where: { userId, taskId: { in: ids } }, select: { taskId: true, lastReadAt: true } }),
      this.prisma.opsTaskComment.findMany({ where: { taskId: { in: ids } }, select: { taskId: true, createdAt: true, authorId: true } }),
    ]);
    const readMap = new Map(reads.map((r) => [r.taskId, r.lastReadAt]));
    const unread = new Map<string, number>();
    for (const c of comments) {
      if (c.authorId === userId) continue;
      const last = readMap.get(c.taskId);
      if (!last || c.createdAt > last) unread.set(c.taskId, (unread.get(c.taskId) ?? 0) + 1);
    }
    return tasks.map((t) => ({ ...t, unread: unread.get(t.id) ?? 0 }));
  }

  /** Все задачи и уборки конкретного номера (§16, карточка номера на шахматке) — полная картина по номеру,
   *  без персонального фильтра видимости (это управленческий вид номера, требует права ops_tasks). */
  async byRoom(tenantId: string, roomId: string) {
    return this.prisma.opsTask.findMany({
      where: { tenantId, roomId },
      include: TASK_INCLUDE,
      orderBy: [{ status: 'asc' }, { important: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  /** Счётчик для сайдбара (§4): новые задачи, назначенные лично мне (ещё не принял) + свободные в моём отделе. */
  async myBadge(tenantId: string, viewer: OpsViewer): Promise<{ count: number }> {
    const myNew = await this.prisma.opsTask.count({ where: { tenantId, assignees: { some: { userId: viewer.id } }, status: 'NEW' } });
    const myGroups = await this.prisma.userGroupMember.findMany({ where: { adminUserId: viewer.id }, select: { groupId: true } });
    const groupIds = myGroups.map((m) => m.groupId);
    const deptFree = groupIds.length
      ? await this.prisma.opsTask.count({ where: { tenantId, groupId: { in: groupIds }, assignees: { none: {} }, status: 'NEW' } })
      : 0;
    return { count: myNew + deptFree };
  }

  /** Свободные задачи моего отдела (§7-E): адресованы моему отделу, без исполнителя, ещё открыты — можно «забрать». */
  async claimable(tenantId: string, viewer: OpsViewer) {
    const myGroups = await this.prisma.userGroupMember.findMany({ where: { adminUserId: viewer.id }, select: { groupId: true } });
    const groupIds = myGroups.map((m) => m.groupId);
    if (groupIds.length === 0) return [];
    const tasks = await this.prisma.opsTask.findMany({
      where: { tenantId, groupId: { in: groupIds }, assignees: { none: {} }, status: { in: ['NEW', 'ACCEPTED'] } },
      include: TASK_INCLUDE,
      orderBy: [{ important: 'desc' }, { severity: 'desc' }, { dueAt: 'asc' }],
      take: 200,
    });
    return this.attachUnread(tasks, viewer.id);
  }

  /** Забрать задачу отдела себе (§7-E): стать исполнителем; NEW → ACCEPTED. Только для задач своего отдела без исполнителя. */
  async claim(tenantId: string, taskId: string, viewer: OpsViewer) {
    const task = await this.getRaw(tenantId, taskId);
    const existing = await this.prisma.opsTaskAssignee.findFirst({ where: { taskId } });
    if (existing) throw new BadRequestException('Задачу уже взял другой сотрудник');
    if (task.groupId) {
      const member = await this.prisma.userGroupMember.findFirst({ where: { adminUserId: viewer.id, groupId: task.groupId } });
      if (!member && !viewer.perms.includes('ops_manage')) throw new ForbiddenException('Задача адресована другому отделу');
    }
    const now = new Date();
    const to: OpsTaskStatus = task.status === 'NEW' ? 'ACCEPTED' : task.status;
    const updated = await this.prisma.opsTask.update({
      where: { id: taskId },
      data: {
        status: to,
        acceptedAt: to === 'ACCEPTED' ? now : undefined,
        lastActivityAt: now,
        assignees: { create: [{ userId: viewer.id }] },
        ...(to !== task.status ? { statusLog: { create: { from: task.status, to, actorId: viewer.id, note: 'взял задачу отдела' } } } : {}),
      },
      include: TASK_INCLUDE,
    });
    await this.audit.record({ tenantId, actorId: viewer.id, action: 'claimed', entity: 'OpsTask', entityId: taskId });
    this.events.emit({ kind: 'task_updated', taskId, userIds: [viewer.id, ...(task.createdBy ? [task.createdBy] : [])], payload: { title: updated.title } });
    return updated;
  }

  /** Отметить задачу прочитанной текущим пользователем (сбрасывает счётчик непрочитанных). */
  async markRead(tenantId: string, taskId: string, viewer: OpsViewer) {
    await this.getRaw(tenantId, taskId);
    await this.prisma.opsTaskRead.upsert({
      where: { taskId_userId: { taskId, userId: viewer.id } },
      create: { taskId, userId: viewer.id },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  /** Карточка задачи; withGuest — добавить гостя текущей/ближайшей брони номера (§4.3, ops_guest_info). */
  async get(tenantId: string, id: string, withGuest = false) {
    const task = await this.prisma.opsTask.findFirst({ where: { id, tenantId }, include: FULL_INCLUDE });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (!withGuest || !task.roomId) return task;
    const guestSelect = { guest: { select: { firstName: true, lastName: true, phone: true } } };
    // Живущий гость, иначе ближайший заезд.
    const current =
      (await this.prisma.booking.findFirst({ where: { tenantId, roomId: task.roomId, status: 'CHECKED_IN' }, include: guestSelect }))
      ?? (await this.prisma.booking.findFirst({
        where: { tenantId, roomId: task.roomId, status: 'CONFIRMED', checkOut: { gte: new Date() } },
        orderBy: { checkIn: 'asc' },
        include: guestSelect,
      }));
    const guestInfo = current
      ? {
          name: [current.guest?.lastName, current.guest?.firstName].filter(Boolean).join(' ') || '—',
          phone: current.guest?.phone ?? null,
          checkIn: current.checkIn,
          checkOut: current.checkOut,
          status: current.status,
        }
      : null;
    return { ...task, guestInfo };
  }

  /** Создание (§4.1). templateId — подмешать поля шаблона. Побочные эффекты: DIRTY / OUT_OF_ORDER. */
  async create(tenantId: string, dto: CreateOpsTaskDto, actorId?: string) {
    if (dto.templateId) {
      const tpl = await this.prisma.opsTaskTemplate.findFirst({ where: { id: dto.templateId, tenantId } });
      if (tpl) {
        const payload = tpl.payload as Partial<CreateOpsTaskDto> & { dueOffsetMinutes?: number; acceptOffsetMinutes?: number };
        // DTO-инстанс несёт все поля класса (в т.ч. undefined) — при merge они не должны затирать шаблон.
        const explicit = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
        dto = { ...payload, ...explicit } as CreateOpsTaskDto;
        // Срок-офсет шаблона («+30 мин»): считается от момента создания (или запланированного старта).
        const base = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
        if (!dto.dueAt && typeof payload.dueOffsetMinutes === 'number') dto.dueAt = new Date(base.getTime() + payload.dueOffsetMinutes * 60_000).toISOString();
        if (!dto.acceptBy && typeof payload.acceptOffsetMinutes === 'number') dto.acceptBy = new Date(base.getTime() + payload.acceptOffsetMinutes * 60_000).toISOString();
      }
    }
    const kind = dto.kind ?? OpsTaskKind.TASK;
    // SLA-матрица (LQA): severity × источник (гость/внутренняя) → автопроставление сроков,
    // если они не заданы явно (только для обычных задач; у уборок — нормативы §6.1).
    if (kind === OpsTaskKind.TASK && (!dto.dueAt || !dto.acceptBy)) {
      const sla = await this.prisma.opsSlaPolicy.findFirst({
        where: { tenantId, severity: dto.severity ?? 'MINOR', guestRequest: dto.guestRequest ?? false, enabled: true },
      });
      if (sla) {
        const base = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
        if (!dto.acceptBy && sla.acceptMinutes) dto.acceptBy = new Date(base.getTime() + sla.acceptMinutes * 60_000).toISOString();
        if (!dto.dueAt && sla.dueMinutes) dto.dueAt = new Date(base.getTime() + sla.dueMinutes * 60_000).toISOString();
      }
    }
    let propertyId = dto.propertyId ?? null;
    let roomTypeId: string | null = null;
    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({ where: { id: dto.roomId, tenantId }, select: { propertyId: true, roomTypeId: true } });
      if (!room) throw new BadRequestException('Номер не найден');
      propertyId = room.propertyId;
      roomTypeId = room.roomTypeId;
    } else if (dto.zoneId) {
      const zone = await this.prisma.zone.findFirst({ where: { id: dto.zoneId, tenantId }, select: { propertyId: true } });
      if (!zone) throw new BadRequestException('Зона не найдена');
      propertyId = zone.propertyId;
    }
    if (!propertyId) throw new BadRequestException('Не указан объект (propertyId/roomId/zoneId)');
    if (dto.blocksSale && !dto.roomId) throw new BadRequestException('Снятие с продажи требует номера');
    if (kind === OpsTaskKind.CLEANING && !dto.roomId && !dto.zoneId) throw new BadRequestException('Уборка требует номер или зону');

    // Снапшоты чек-листов: явные + чек-лист типа уборки (§5.2).
    const checklistIds = [...(dto.checklistIds ?? [])];
    let checklistBeforeStart = false;
    if (kind === OpsTaskKind.CLEANING && dto.cleaningTypeId) {
      const ct = await this.prisma.cleaningType.findFirst({ where: { id: dto.cleaningTypeId, tenantId } });
      if (!ct) throw new BadRequestException('Тип уборки не найден');
      if (ct.checklistId && !checklistIds.includes(ct.checklistId)) {
        checklistIds.push(ct.checklistId);
        checklistBeforeStart = ct.checklistBeforeStart;
      }
    }
    const checklists = checklistIds.length
      ? await this.prisma.checklist.findMany({ where: { id: { in: checklistIds }, tenantId }, include: { items: { orderBy: { order: 'asc' } } } })
      : [];

    const status: OpsTaskStatus = dto.scheduledAt ? 'PLAN' : 'NEW';
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.opsTask.create({
        data: {
          tenantId,
          kind,
          status,
          title: dto.title,
          description: dto.description ?? null,
          propertyId,
          roomId: dto.roomId ?? null,
          zoneId: dto.zoneId ?? null,
          cleaningTypeId: kind === OpsTaskKind.CLEANING ? (dto.cleaningTypeId ?? null) : null,
          important: dto.important ?? false,
          severity: dto.severity ?? 'MINOR',
          blocksSale: dto.blocksSale ?? false,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          acceptBy: dto.acceptBy ? new Date(dto.acceptBy) : null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          planDate: kind === OpsTaskKind.CLEANING ? this.day(dto.planDate ? new Date(dto.planDate) : new Date()) : null,
          supervisorId: dto.supervisorId ?? null,
          templateId: dto.templateId ?? null,
          requirePhotoResult: dto.requirePhotoResult ?? false,
          requireConfirmation: dto.requireConfirmation ?? false,
          guestRequest: dto.guestRequest ?? false,
          followUpText: dto.followUpText?.trim() || null,
          followUpAssigneeId: dto.followUpAssigneeId ?? null,
          parentTaskId: dto.parentTaskId ?? null,
          createdBy: actorId ?? null,
          groupId: dto.groupId ?? null,
          assignees: { create: (dto.assigneeIds ?? []).map((userId) => ({ userId })) },
          watchers: { create: (dto.watcherIds ?? []).map((userId) => ({ userId })) },
          tags: { create: (dto.tagIds ?? []).map((tagId) => ({ tagId })) },
          checklists: {
            create: checklists.map((cl) => ({
              checklistId: cl.id,
              name: cl.name,
              requiredBeforeStart: checklistBeforeStart && dto.cleaningTypeId != null,
              itemsSnapshot: cl.items.map((i) => ({
                id: i.id, parentId: i.parentId, order: i.order, kind: i.kind, text: i.text,
                thirdOption: i.thirdOption, requirePhoto: i.requirePhoto, excludeFromScore: i.excludeFromScore,
              })) as unknown as Prisma.InputJsonValue,
            })),
          },
          statusLog: { create: { from: status, to: status, actorId: actorId ?? null, note: 'создана' } },
        },
        include: TASK_INCLUDE,
      });
      if (kind === OpsTaskKind.CLEANING && dto.roomId) {
        await tx.room.update({ where: { id: dto.roomId }, data: { housekeepingStatus: 'DIRTY' } });
      }
      if (dto.blocksSale && dto.roomId) {
        await tx.room.update({ where: { id: dto.roomId }, data: { maintenanceStatus: 'OUT_OF_ORDER' } });
      }
      return created;
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'OpsTask', entityId: task.id, payload: { kind, title: dto.title, roomId: dto.roomId, blocksSale: dto.blocksSale } });
    if (status === 'NEW') this.events.emit({ kind: 'task_created', taskId: task.id, userIds: dto.assigneeIds, payload: { title: task.title, important: task.important, severity: task.severity } });
    void roomTypeId;
    return task;
  }

  async update(tenantId: string, id: string, dto: UpdateOpsTaskDto, viewer: OpsViewer) {
    const task = await this.requireEditable(tenantId, id, viewer);
    const updated = await this.prisma.opsTask.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        important: dto.important,
        severity: dto.severity,
        dueAt: dto.dueAt !== undefined ? (dto.dueAt ? new Date(dto.dueAt) : null) : undefined,
        acceptBy: dto.acceptBy !== undefined ? (dto.acceptBy ? new Date(dto.acceptBy) : null) : undefined,
        // Сменили срок — заново шлём напоминания «за 7 и 2 дня» под новую дату (workflow-ТЗ §8).
        notifiedDue7At: dto.dueAt !== undefined ? null : undefined,
        notifiedDue2At: dto.dueAt !== undefined ? null : undefined,
        supervisorId: dto.supervisorId,
        cleaningTypeId: dto.cleaningTypeId,
        requirePhotoResult: dto.requirePhotoResult,
        requireConfirmation: dto.requireConfirmation,
        guestRequest: dto.guestRequest,
        groupId: dto.groupId !== undefined ? (dto.groupId || null) : undefined,
        assignees: dto.assigneeIds ? { deleteMany: {}, create: dto.assigneeIds.map((userId) => ({ userId })) } : undefined,
        watchers: dto.watcherIds ? { deleteMany: {}, create: dto.watcherIds.map((userId) => ({ userId })) } : undefined,
        tags: dto.tagIds ? { deleteMany: {}, create: dto.tagIds.map((tagId) => ({ tagId })) } : undefined,
      },
      include: TASK_INCLUDE,
    });
    await this.audit.record({ tenantId, actorId: viewer.id, action: 'updated', entity: 'OpsTask', entityId: id });
    this.events.emit({ kind: 'task_updated', taskId: id, userIds: dto.assigneeIds });
    void task;
    return updated;
  }

  async remove(tenantId: string, id: string, viewer: OpsViewer) {
    const task = await this.requireEditable(tenantId, id, viewer);
    await this.prisma.$transaction(async (tx) => {
      // Снять побочные эффекты незакрытой задачи с номера.
      if (task.roomId && task.blocksSale && task.status !== 'DONE' && task.status !== 'CANCELLED') {
        await tx.room.update({ where: { id: task.roomId }, data: { maintenanceStatus: 'OK' } });
      }
      await tx.opsTask.delete({ where: { id } });
    });
    await this.audit.record({ tenantId, actorId: viewer.id, action: 'deleted', entity: 'OpsTask', entityId: id, payload: { title: task.title } });
  }

  /** Переход статуса (§3.2) с побочными эффектами на номер и учётом факт-времени. */
  async changeStatus(tenantId: string, id: string, dto: ChangeStatusDto, viewer: OpsViewer) {
    const task = await this.getRaw(tenantId, id);
    const from = task.status;
    const to = dto.to;
    if (from === to) return this.get(tenantId, id);
    if (!TRANSITIONS[from].includes(to)) throw new BadRequestException(`Переход ${from} → ${to} недопустим`);
    const reopen = (from === 'DONE' || from === 'CANCELLED') && to === 'NEW';
    if (reopen && !viewer.perms.includes('ops_manage')) throw new ForbiddenException('Переоткрытие — только с правом ops_manage');
    if (to === 'CANCELLED' && !dto.note?.trim()) throw new BadRequestException('Отмена требует комментария-причины');

    // Блокер отложенной задачи (workflow-ТЗ §2.1): при переводе в «Отложена» нужна причина и дата,
    // от которой считать напоминания «за 7 и 2 дня» — срок задачи либо ожидаемая дата решения.
    if (to === 'PAUSED') {
      if (!dto.blockerKind) throw new BadRequestException('Укажите причину, почему откладываете задачу');
      if (dto.blockerKind === 'SCHEDULED' && !dto.blockerUntil) throw new BadRequestException('Для «отложено на дату» укажите дату');
      if (!task.dueAt && !dto.blockerUntil) throw new BadRequestException('У задачи нет срока — укажите ожидаемую дату решения');
    }

    // Подтверждение установщика (§3.2): при requireConfirmation завершать напрямую нельзя —
    // сначала «Ждёт подтверждения», затем установщик/супервайзер/руководитель подтверждает → DONE.
    const isConfirmer = task.createdBy === viewer.id || task.supervisorId === viewer.id || viewer.perms.includes('ops_manage');
    if (to === 'DONE' && task.requireConfirmation && from !== 'WAITING_CONFIRM') {
      throw new BadRequestException('Задача требует подтверждения — отправьте её «На подтверждение», установщик завершит');
    }
    if (from === 'WAITING_CONFIRM' && to === 'DONE' && !isConfirmer) {
      throw new ForbiddenException('Подтвердить выполнение может установщик, супервайзер или роль с ops_manage');
    }

    if (to === 'IN_PROGRESS') {
      // Чек-лист «перед началом» должен быть завершён (§5.2).
      const gate = await this.prisma.opsTaskChecklist.findMany({ where: { taskId: id, requiredBeforeStart: true }, include: { answers: true } });
      for (const cl of gate) if (!this.isChecklistComplete(cl.itemsSnapshot as unknown as SnapshotItem[], cl.answers)) {
        throw new BadRequestException(`Сначала пройдите чек-лист «${cl.name}»`);
      }
    }
    // Чек-лист должен быть завершён к моменту сдачи работы (DONE или отправки на подтверждение).
    if (to === 'DONE' || to === 'WAITING_CONFIRM') {
      const lists = await this.prisma.opsTaskChecklist.findMany({ where: { taskId: id, requiredBeforeStart: false }, include: { answers: true } });
      for (const cl of lists) if (!this.isChecklistComplete(cl.itemsSnapshot as unknown as SnapshotItem[], cl.answers)) {
        throw new BadRequestException(`Чек-лист «${cl.name}» не завершён`);
      }
    }

    const now = new Date();
    const leaveProgress = from === 'IN_PROGRESS' && task.inProgressSince ? Math.round((now.getTime() - task.inProgressSince.getTime()) / 1000) : 0;
    // Возвратный шаг (workflow-ТЗ §6): при первом закрытии задачи с followUpText порождаем задачу автору.
    const willFireFollowUp = to === 'DONE' && !!task.followUpText && !task.followUpFiredAt;

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.OpsTaskUpdateInput = {
        status: to,
        lastActivityAt: now,
        acceptedAt: to === 'ACCEPTED' ? now : undefined,
        startedAt: to === 'IN_PROGRESS' && !task.startedAt ? now : undefined,
        inProgressSince: to === 'IN_PROGRESS' ? now : from === 'IN_PROGRESS' ? null : undefined,
        workSeconds: leaveProgress ? { increment: leaveProgress } : undefined,
        completedAt: to === 'DONE' ? now : reopen ? null : undefined,
        cancelledBy: to === 'CANCELLED' ? viewer.id : undefined,
        // Блокер: ставим при переводе в «Отложена», снимаем при выходе из неё (workflow-ТЗ §2.1).
        blockerKind: to === 'PAUSED' ? dto.blockerKind : from === 'PAUSED' ? null : undefined,
        blockerNote: to === 'PAUSED' ? (dto.blockerNote?.trim() || null) : from === 'PAUSED' ? null : undefined,
        blockerUntil: to === 'PAUSED' ? (dto.blockerUntil ? new Date(dto.blockerUntil) : null) : from === 'PAUSED' ? null : undefined,
        pausedSince: to === 'PAUSED' ? now : from === 'PAUSED' ? null : undefined,
        // Пере-считываем напоминания под новую дату отсчёта.
        notifiedDue7At: to === 'PAUSED' ? null : undefined,
        notifiedDue2At: to === 'PAUSED' ? null : undefined,
        followUpFiredAt: willFireFollowUp ? now : undefined,
        statusLog: { create: { from, to, actorId: viewer.id, note: dto.note ?? null } },
      };
      const t = await tx.opsTask.update({ where: { id }, data, include: TASK_INCLUDE });
      if (dto.note?.trim()) await tx.opsTaskComment.create({ data: { taskId: id, authorId: viewer.id, body: dto.note.trim() } });

      // Побочные эффекты на номер (§3.2, §6.4).
      if (task.roomId) {
        if (task.kind === 'CLEANING') {
          if (to === 'IN_PROGRESS') await tx.room.update({ where: { id: task.roomId }, data: { housekeepingStatus: 'IN_PROGRESS' } });
          if (to === 'DONE') await tx.room.update({ where: { id: task.roomId }, data: { housekeepingStatus: 'CLEAN', cleanRequestedAt: null } });
          if (reopen) await tx.room.update({ where: { id: task.roomId }, data: { housekeepingStatus: 'DIRTY' } });
        }
        if (task.blocksSale) {
          if (to === 'DONE' || to === 'CANCELLED') await tx.room.update({ where: { id: task.roomId }, data: { maintenanceStatus: 'OK' } });
          if (reopen) await tx.room.update({ where: { id: task.roomId }, data: { maintenanceStatus: 'OUT_OF_ORDER' } });
        }
      }
      return t;
    });

    // Фото результата (§4.1): при завершении без фото — авто-комментарий «требует проверки».
    if (to === 'DONE' && task.requirePhotoResult) {
      const photos = await this.prisma.opsTaskAttachment.count({ where: { taskId: id, createdAt: task.startedAt ? { gte: task.startedAt } : undefined } });
      if (photos === 0) await this.prisma.opsTaskComment.create({ data: { taskId: id, authorId: null, body: 'Фото результата не приложено — задача требует проверки.' } });
    }

    await this.audit.record({ tenantId, actorId: viewer.id, action: 'status', entity: 'OpsTask', entityId: id, payload: { from, to } });
    const notifyIds = [...updated.assignees.map((a) => a.userId), ...updated.watchers.map((w) => w.userId), ...(task.createdBy ? [task.createdBy] : [])];
    this.events.emit({ kind: 'task_status', taskId: id, userIds: notifyIds, payload: { from, to, title: updated.title } });

    // Возвратный шаг: после успешного закрытия создаём задачу автору/указанному сотруднику (вне транзакции —
    // create() открывает свою). Наследуем объект/номер, чтобы было понятно, о ком речь (сценарий «перезвонить гостю»).
    if (willFireFollowUp) {
      const assignee = task.followUpAssigneeId ?? task.createdBy;
      if (assignee) {
        await this.create(tenantId, {
          title: task.followUpText!,
          kind: 'TASK',
          propertyId: task.propertyId,
          roomId: task.roomId ?? undefined,
          zoneId: task.roomId ? undefined : (task.zoneId ?? undefined),
          assigneeIds: [assignee],
          important: task.important,
          guestRequest: task.guestRequest,
          parentTaskId: id,
        } as CreateOpsTaskDto, viewer.id).catch(() => undefined);
      }
    }
    return updated;
  }

  /** Инспекция уборки (§6.4, право ops_inspect): DONE-уборка → номер INSPECTED. */
  async inspect(tenantId: string, id: string, viewer: OpsViewer) {
    const task = await this.getRaw(tenantId, id);
    if (task.kind !== 'CLEANING') throw new BadRequestException('Инспекция применима только к уборке');
    if (task.status !== 'DONE') throw new BadRequestException('Сначала завершите уборку');
    if (!task.roomId) throw new BadRequestException('У уборки нет номера');
    await this.prisma.room.update({ where: { id: task.roomId }, data: { housekeepingStatus: 'INSPECTED' } });
    await this.audit.record({ tenantId, actorId: viewer.id, action: 'inspected', entity: 'OpsTask', entityId: id });
    return this.get(tenantId, id);
  }

  async comment(tenantId: string, id: string, body: string, viewer: OpsViewer) {
    const task = await this.getRaw(tenantId, id);
    const created = await this.prisma.opsTaskComment.create({ data: { taskId: id, authorId: viewer.id, body } });
    await this.prisma.opsTask.update({ where: { id }, data: { lastActivityAt: new Date() } });
    const notifyIds = await this.participantIds(id, task.createdBy);
    this.events.emit({ kind: 'task_comment', taskId: id, userIds: notifyIds.filter((u) => u !== viewer.id), payload: { title: task.title } });
    return created;
  }

  async attach(tenantId: string, id: string, fileUrl: string, name: string | undefined, viewer: OpsViewer, answerId?: string) {
    await this.getRaw(tenantId, id);
    return this.prisma.opsTaskAttachment.create({ data: { taskId: id, fileUrl, name: name ?? null, createdBy: viewer.id, answerId: answerId ?? null } });
  }

  /** Ответ на пункт чек-листа (§5.3). answer пустой/undefined — сохранить только комментарий (§5.3). */
  async answerChecklist(tenantId: string, taskId: string, taskChecklistId: string, itemId: string, answer: string | undefined, comment: string | undefined, viewer: OpsViewer, photoUrl?: string) {
    await this.getRaw(tenantId, taskId);
    const cl = await this.prisma.opsTaskChecklist.findFirst({ where: { id: taskChecklistId, taskId } });
    if (!cl) throw new NotFoundException('Чек-лист не найден');
    const items = cl.itemsSnapshot as unknown as SnapshotItem[];
    const item = items.find((i) => i.id === itemId);
    if (!item || item.kind === 'HEADER') throw new BadRequestException('Пункт не найден');
    if (answer === 'THIRD' && !item.thirdOption) throw new BadRequestException('У пункта нет дополнительного варианта');
    return this.prisma.opsChecklistAnswer.upsert({
      where: { taskChecklistId_itemId: { taskChecklistId, itemId } },
      create: { taskChecklistId, itemId, answer: answer ?? '', comment: comment ?? null, photoUrl: photoUrl ?? null, answeredBy: viewer.id },
      update: { answer: answer ?? undefined, comment: comment ?? undefined, photoUrl: photoUrl ?? undefined, answeredBy: viewer.id, answeredAt: new Date() },
    });
  }

  /** Автозавершение (§5.3): дозакрыть пункты, если все «с фото» и «с доп. вариантом» уже отмечены. */
  async autocompleteChecklist(tenantId: string, taskId: string, taskChecklistId: string, viewer: OpsViewer) {
    await this.getRaw(tenantId, taskId);
    const cl = await this.prisma.opsTaskChecklist.findFirst({ where: { id: taskChecklistId, taskId }, include: { answers: true } });
    if (!cl) throw new NotFoundException('Чек-лист не найден');
    const items = (cl.itemsSnapshot as unknown as SnapshotItem[]).filter((i) => i.kind !== 'HEADER');
    // «Отвечено» = непустой ответ; строки только с комментарием (answer='') дозакрываются.
    const answered = new Set(cl.answers.filter((a) => a.answer).map((a) => a.itemId));
    const missing = items.filter((i) => !answered.has(i.id));
    if (missing.some((i) => i.requirePhoto || i.thirdOption)) {
      throw new BadRequestException('Автозавершение недоступно: остались пункты с фото или доп. вариантом');
    }
    // upsert (не createMany): сохранить существующий комментарий, проставив ответ AUTO.
    await this.prisma.$transaction(missing.map((i) => this.prisma.opsChecklistAnswer.upsert({
      where: { taskChecklistId_itemId: { taskChecklistId, itemId: i.id } },
      create: { taskChecklistId, itemId: i.id, answer: 'AUTO', answeredBy: viewer.id },
      update: { answer: 'AUTO', answeredBy: viewer.id, answeredAt: new Date() },
    })));
    return this.prisma.opsTaskChecklist.findFirst({ where: { id: taskChecklistId }, include: { answers: true } });
  }

  /** Создать задачу из пункта чек-листа (§5.3): «нет — кран течёт» → задача инженеру. */
  async taskFromChecklistItem(tenantId: string, taskId: string, taskChecklistId: string, itemId: string, viewer: OpsViewer, assigneeIds?: string[]) {
    const source = await this.getRaw(tenantId, taskId);
    const cl = await this.prisma.opsTaskChecklist.findFirst({ where: { id: taskChecklistId, taskId } });
    if (!cl) throw new NotFoundException('Чек-лист не найден');
    const item = (cl.itemsSnapshot as unknown as SnapshotItem[]).find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Пункт не найден');
    return this.create(tenantId, {
      title: item.text,
      description: `Из чек-листа «${cl.name}» задачи «${source.title}»`,
      roomId: source.roomId ?? undefined,
      zoneId: source.zoneId ?? undefined,
      propertyId: source.propertyId,
      assigneeIds,
    }, viewer.id);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  isChecklistComplete(items: SnapshotItem[], answers: { itemId: string; photoUrl: string | null; answer: string }[]): boolean {
    const byItem = new Map(answers.map((a) => [a.itemId, a]));
    for (const i of items) {
      if (i.kind === 'HEADER') continue;
      const a = byItem.get(i.id);
      if (!a || !a.answer) return false; // строка только с комментарием (answer='') не считается отвеченной
      if (i.requirePhoto && !a.photoUrl) return false;
    }
    return true;
  }

  private async participantIds(taskId: string, createdBy: string | null): Promise<string[]> {
    const [assignees, watchers] = await Promise.all([
      this.prisma.opsTaskAssignee.findMany({ where: { taskId } }),
      this.prisma.opsTaskWatcher.findMany({ where: { taskId } }),
    ]);
    return [...new Set([...assignees.map((a) => a.userId), ...watchers.map((w) => w.userId), ...(createdBy ? [createdBy] : [])])];
  }

  /** Редактировать/делегировать могут: создатель, супервайзер, исполнитель или роль с ops_manage (§4.4). */
  private async requireEditable(tenantId: string, id: string, viewer: OpsViewer) {
    const task = await this.getRaw(tenantId, id);
    if (task.createdBy === viewer.id || task.supervisorId === viewer.id || viewer.perms.includes('ops_manage')) return task;
    const isAssignee = await this.prisma.opsTaskAssignee.findFirst({ where: { taskId: id, userId: viewer.id } });
    if (isAssignee) return task;
    throw new ForbiddenException('Редактировать может создатель, супервайзер, исполнитель или роль с ops_manage');
  }

  /** Делегирование (§4.4): передать задачу другому исполнителю или отделу; прежние — в наблюдатели. */
  async delegate(tenantId: string, id: string, dto: { toUserId?: string; toGroupId?: string; note?: string }, viewer: OpsViewer) {
    const task = await this.requireEditable(tenantId, id, viewer);
    if (!dto.toUserId && !dto.toGroupId) throw new BadRequestException('Укажите исполнителя или отдел для делегирования');
    const prev = await this.prisma.opsTaskAssignee.findMany({ where: { taskId: id }, select: { userId: true } });
    // Прежние исполнители + делегирующий остаются наблюдателями, чтобы видеть ход.
    const keepWatchers = [...new Set([...prev.map((a) => a.userId), viewer.id])].filter((u) => u !== dto.toUserId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.opsTask.update({
        where: { id },
        data: {
          groupId: dto.toGroupId ?? null,
          assignees: dto.toUserId ? { deleteMany: {}, create: [{ userId: dto.toUserId }] } : { deleteMany: {} },
          watchers: { upsert: keepWatchers.map((userId) => ({ where: { taskId_userId: { taskId: id, userId } }, create: { userId }, update: {} })) },
        },
        include: TASK_INCLUDE,
      });
      const toName = dto.toUserId ? 'сотруднику' : 'отделу';
      await tx.opsTaskComment.create({ data: { taskId: id, authorId: viewer.id, body: `Задача делегирована ${toName}${dto.note ? `: ${dto.note}` : ''}.` } });
      return t;
    });
    await this.audit.record({ tenantId, actorId: viewer.id, action: 'delegated', entity: 'OpsTask', entityId: id, payload: { toUserId: dto.toUserId, toGroupId: dto.toGroupId } });
    const notify = [...(dto.toUserId ? [dto.toUserId] : []), ...keepWatchers];
    this.events.emit({ kind: 'task_updated', taskId: id, userIds: notify, payload: { title: updated.title } });
    return updated;
  }

  async getRaw(tenantId: string, id: string) {
    const task = await this.prisma.opsTask.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    return task;
  }

  /** Полночь UTC дня (ключ planDate). */
  day(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}
