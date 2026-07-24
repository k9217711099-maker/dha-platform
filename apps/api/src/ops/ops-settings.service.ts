import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type {
  SaveAutomationDto, SaveChecklistDto, SaveCleaningRuleDto, SaveCleaningStandardDto,
  SaveCleaningTypeDto, SavePmRuleDto, SaveRecurringDto, SaveSectionDto, SaveSlaPolicyDto,
  SaveTagDto, SaveTemplateDto, SaveWriteoffListDto, SaveZoneDto,
} from './dto/ops.dto.js';

/** Пресеты типов уборок (создаются на тенанта при первом обращении, §6.1). */
const TYPE_PRESETS = [
  { presetKey: 'departure', name: 'Выездная', color: '#f59e0b' },
  { presetKey: 'stayover', name: 'Текущая', color: '#0ea5e9' },
  { presetKey: 'occupied', name: 'Жилая', color: '#10b981' },
];

/** Палитра для авто-создаваемых тегов/отделов при импорте шаблонов. */
const IMPORT_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

/** Справочники модуля «Задачи и Уборка»: теги, чек-листы, типы/правила/нормативы уборок и пр. */
@Injectable()
export class OpsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Режим модуля задач (workflow-ТЗ §10): simple (как раньше) | advanced (дэшборды/блокеры) ──
  //    Переключается на уровне сети (владелец), а не пер-юзер: данные единые, тумблер меняет только UI.
  async getTasksMode(tenantId: string): Promise<'simple' | 'advanced'> {
    const row = await this.prisma.setting.findUnique({ where: { key: `ops.tasksMode:${tenantId}` } });
    return row?.value === 'advanced' ? 'advanced' : 'simple';
  }
  async setTasksMode(tenantId: string, mode: string): Promise<{ mode: 'simple' | 'advanced' }> {
    const value: 'simple' | 'advanced' = mode === 'advanced' ? 'advanced' : 'simple';
    const key = `ops.tasksMode:${tenantId}`;
    await this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return { mode: value };
  }

  // ── Теги (§8.2) ──────────────────────────────────────────────────────────
  tags(tenantId: string, archived = false) {
    return this.prisma.opsTag.findMany({ where: { tenantId, archivedAt: archived ? { not: null } : null }, orderBy: { name: 'asc' } });
  }
  createTag(tenantId: string, dto: SaveTagDto) {
    return this.prisma.opsTag.create({ data: { tenantId, name: dto.name, color: dto.color ?? '#6366f1', comment: dto.comment ?? null } });
  }
  async updateTag(tenantId: string, id: string, dto: Partial<SaveTagDto> & { archived?: boolean }) {
    await this.require(this.prisma.opsTag, tenantId, id, 'Тег');
    return this.prisma.opsTag.update({
      where: { id },
      data: { name: dto.name, color: dto.color, comment: dto.comment, archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null },
    });
  }

  // ── Чек-листы (§5.1) ─────────────────────────────────────────────────────
  checklists(tenantId: string) {
    return this.prisma.checklist.findMany({ where: { tenantId, archivedAt: null }, include: { items: { orderBy: { order: 'asc' } } }, orderBy: { name: 'asc' } });
  }
  /** Создание/пересохранение: пункты пересоздаются; parentIndex — индекс родителя в массиве. */
  async saveChecklist(tenantId: string, dto: SaveChecklistDto, id?: string) {
    return this.prisma.$transaction(async (tx) => {
      let checklistId = id;
      if (checklistId) {
        const existing = await tx.checklist.findFirst({ where: { id: checklistId, tenantId } });
        if (!existing) throw new NotFoundException('Чек-лист не найден');
        await tx.checklist.update({ where: { id: checklistId }, data: { name: dto.name } });
        await tx.checklistItem.deleteMany({ where: { checklistId } });
      } else {
        checklistId = (await tx.checklist.create({ data: { tenantId, name: dto.name } })).id;
      }
      const createdIds: string[] = [];
      for (const [idx, item] of dto.items.entries()) {
        const parentId = item.parentIndex != null ? (createdIds[item.parentIndex] ?? null) : null;
        const created = await tx.checklistItem.create({
          data: {
            checklistId, parentId, order: idx,
            kind: item.kind === 'HEADER' || item.kind === 'SUBITEM' ? item.kind : 'ITEM',
            text: item.text, thirdOption: item.thirdOption ?? null,
            requirePhoto: item.requirePhoto ?? false, excludeFromScore: item.excludeFromScore ?? false,
          },
        });
        createdIds.push(created.id);
      }
      return tx.checklist.findFirst({ where: { id: checklistId }, include: { items: { orderBy: { order: 'asc' } } } });
    });
  }
  async archiveChecklist(tenantId: string, id: string) {
    await this.require(this.prisma.checklist, tenantId, id, 'Чек-лист');
    return this.prisma.checklist.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  // ── Шаблоны задач (§4.5) ─────────────────────────────────────────────────
  templates(tenantId: string) {
    return this.prisma.opsTaskTemplate.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  createTemplate(tenantId: string, dto: SaveTemplateDto) {
    return this.prisma.opsTaskTemplate.create({ data: { tenantId, name: dto.name, payload: dto.payload as Prisma.InputJsonValue } });
  }
  async updateTemplate(tenantId: string, id: string, dto: SaveTemplateDto) {
    await this.require(this.prisma.opsTaskTemplate, tenantId, id, 'Шаблон');
    return this.prisma.opsTaskTemplate.update({ where: { id }, data: { name: dto.name, payload: dto.payload as Prisma.InputJsonValue } });
  }
  async deleteTemplate(tenantId: string, id: string) {
    await this.require(this.prisma.opsTaskTemplate, tenantId, id, 'Шаблон');
    await this.prisma.opsTaskTemplate.delete({ where: { id } });
  }

  // ── Планировщик (§4.7) ───────────────────────────────────────────────────
  recurring(tenantId: string) {
    return this.prisma.opsRecurringRule.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  createRecurring(tenantId: string, dto: SaveRecurringDto) {
    this.validateTime(dto.time);
    if (dto.freq === 'INTERVAL' && !dto.intervalDays) throw new BadRequestException('Для «каждые N дней» укажите интервал');
    return this.prisma.opsRecurringRule.create({
      data: {
        tenantId, name: dto.name, payload: dto.payload as Prisma.InputJsonValue, freq: dto.freq, time: dto.time,
        days: dto.days ?? [], intervalDays: dto.intervalDays ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null, enabled: dto.enabled ?? true,
      },
    });
  }
  async updateRecurring(tenantId: string, id: string, dto: Partial<SaveRecurringDto>) {
    if (dto.time) this.validateTime(dto.time);
    await this.require(this.prisma.opsRecurringRule, tenantId, id, 'Правило');
    return this.prisma.opsRecurringRule.update({
      where: { id },
      data: {
        name: dto.name, payload: dto.payload as Prisma.InputJsonValue | undefined, freq: dto.freq, time: dto.time,
        days: dto.days, intervalDays: dto.intervalDays,
        startDate: dto.startDate !== undefined ? (dto.startDate ? new Date(dto.startDate) : null) : undefined,
        enabled: dto.enabled,
      },
    });
  }
  async deleteRecurring(tenantId: string, id: string) {
    await this.require(this.prisma.opsRecurringRule, tenantId, id, 'Правило');
    await this.prisma.opsRecurringRule.delete({ where: { id } });
  }

  // ── Автоматизация (§8.1) ─────────────────────────────────────────────────
  automation(tenantId: string) {
    return this.prisma.opsAutomationRule.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  createAutomation(tenantId: string, dto: SaveAutomationDto) {
    // «Уведомить руководителя» с выбором «Конкретный сотрудник» требует получателя; иначе адресат берётся из отдела/супервайзера/создателя.
    if (dto.type === 'ESCALATE' && (dto.notifyTarget ?? 'USER') === 'USER' && !dto.escalateToUserId) {
      throw new BadRequestException('Укажите сотрудника или выберите, кого уведомлять (руководитель отдела / супервайзер / постановщик)');
    }
    return this.prisma.opsAutomationRule.create({ data: { tenantId, ...dto } });
  }
  async updateAutomation(tenantId: string, id: string, dto: Partial<SaveAutomationDto>) {
    await this.require(this.prisma.opsAutomationRule, tenantId, id, 'Правило');
    return this.prisma.opsAutomationRule.update({ where: { id }, data: dto });
  }
  async deleteAutomation(tenantId: string, id: string) {
    await this.require(this.prisma.opsAutomationRule, tenantId, id, 'Правило');
    await this.prisma.opsAutomationRule.delete({ where: { id } });
  }

  // ── Типы уборок (§6.1) ───────────────────────────────────────────────────
  async cleaningTypes(tenantId: string) {
    const existing = await this.prisma.cleaningType.findMany({ where: { tenantId, archivedAt: null }, orderBy: { name: 'asc' } });
    if (existing.length > 0) return existing;
    await this.prisma.cleaningType.createMany({ data: TYPE_PRESETS.map((p) => ({ tenantId, ...p })) });
    return this.prisma.cleaningType.findMany({ where: { tenantId, archivedAt: null }, orderBy: { name: 'asc' } });
  }
  createCleaningType(tenantId: string, dto: SaveCleaningTypeDto) {
    return this.prisma.cleaningType.create({
      data: { tenantId, name: dto.name, forResidential: dto.forResidential ?? true, color: dto.color ?? '#0ea5e9', checklistId: dto.checklistId ?? null, checklistBeforeStart: dto.checklistBeforeStart ?? false },
    });
  }
  async updateCleaningType(tenantId: string, id: string, dto: Partial<SaveCleaningTypeDto> & { archived?: boolean }) {
    await this.require(this.prisma.cleaningType, tenantId, id, 'Тип уборки');
    return this.prisma.cleaningType.update({
      where: { id },
      data: {
        name: dto.name, forResidential: dto.forResidential, color: dto.color,
        checklistId: dto.checklistId === undefined ? undefined : dto.checklistId || null,
        checklistBeforeStart: dto.checklistBeforeStart,
        archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
      },
    });
  }

  // ── Нормативы (§6.1) ─────────────────────────────────────────────────────
  standards(tenantId: string) {
    return this.prisma.cleaningStandard.findMany({ where: { tenantId } });
  }
  async saveStandard(tenantId: string, dto: SaveCleaningStandardDto) {
    // Не upsert: roomTypeId nullable, а null в составном unique-where Prisma не принимает.
    const existing = await this.prisma.cleaningStandard.findFirst({
      where: { tenantId, cleaningTypeId: dto.cleaningTypeId, roomTypeId: dto.roomTypeId ?? null },
    });
    if (existing) return this.prisma.cleaningStandard.update({ where: { id: existing.id }, data: { minutes: dto.minutes } });
    return this.prisma.cleaningStandard.create({ data: { tenantId, cleaningTypeId: dto.cleaningTypeId, roomTypeId: dto.roomTypeId ?? null, minutes: dto.minutes } });
  }
  async deleteStandard(tenantId: string, id: string) {
    await this.require(this.prisma.cleaningStandard, tenantId, id, 'Норматив');
    await this.prisma.cleaningStandard.delete({ where: { id } });
  }

  // ── Правила уборок (§6.2) ────────────────────────────────────────────────
  rules(tenantId: string) {
    return this.prisma.cleaningRule.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  }
  createRule(tenantId: string, dto: SaveCleaningRuleDto) {
    return this.prisma.cleaningRule.create({
      data: {
        tenantId, cleaningTypeId: dto.cleaningTypeId, condition: dto.condition,
        propertyId: dto.propertyId ?? null, roomTypeId: dto.roomTypeId ?? null, minStayNights: dto.minStayNights ?? null,
        ratePlanId: dto.ratePlanId ?? null, promoCode: dto.promoCode?.trim() || null, enabled: dto.enabled ?? true,
      },
    });
  }
  async updateRule(tenantId: string, id: string, dto: Partial<SaveCleaningRuleDto>) {
    await this.require(this.prisma.cleaningRule, tenantId, id, 'Правило');
    return this.prisma.cleaningRule.update({
      where: { id },
      data: {
        cleaningTypeId: dto.cleaningTypeId, condition: dto.condition, propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId, minStayNights: dto.minStayNights,
        ratePlanId: dto.ratePlanId, promoCode: dto.promoCode !== undefined ? dto.promoCode?.trim() || null : undefined,
        enabled: dto.enabled,
      },
    });
  }
  async deleteRule(tenantId: string, id: string) {
    await this.require(this.prisma.cleaningRule, tenantId, id, 'Правило');
    await this.prisma.cleaningRule.delete({ where: { id } });
  }

  // ── Зоны и секции (§7) ───────────────────────────────────────────────────
  zones(tenantId: string) {
    return this.prisma.zone.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' } });
  }
  createZone(tenantId: string, dto: SaveZoneDto) {
    return this.prisma.zone.create({ data: { tenantId, ...dto } });
  }
  async updateZone(tenantId: string, id: string, dto: Partial<SaveZoneDto> & { active?: boolean }) {
    await this.require(this.prisma.zone, tenantId, id, 'Зона');
    return this.prisma.zone.update({ where: { id }, data: dto });
  }
  sections(tenantId: string) {
    return this.prisma.section.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  createSection(tenantId: string, dto: SaveSectionDto) {
    return this.prisma.section.create({ data: { tenantId, ...dto } });
  }
  async deleteSection(tenantId: string, id: string) {
    await this.require(this.prisma.section, tenantId, id, 'Секция');
    await this.prisma.$transaction([
      this.prisma.room.updateMany({ where: { sectionId: id }, data: { sectionId: null } }),
      this.prisma.section.delete({ where: { id } }),
    ]);
  }

  // ── Листы списания (§6.6) ────────────────────────────────────────────────
  writeoffLists(tenantId: string) {
    return this.prisma.cleaningWriteoffList.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }
  createWriteoffList(tenantId: string, dto: SaveWriteoffListDto) {
    return this.prisma.cleaningWriteoffList.create({
      data: { tenantId, name: dto.name, cleaningTypeId: dto.cleaningTypeId ?? null, roomTypeId: dto.roomTypeId ?? null, items: dto.items as unknown as Prisma.InputJsonValue },
    });
  }
  async updateWriteoffList(tenantId: string, id: string, dto: Partial<SaveWriteoffListDto>) {
    await this.require(this.prisma.cleaningWriteoffList, tenantId, id, 'Лист списания');
    return this.prisma.cleaningWriteoffList.update({
      where: { id },
      data: { name: dto.name, cleaningTypeId: dto.cleaningTypeId, roomTypeId: dto.roomTypeId, items: dto.items as unknown as Prisma.InputJsonValue | undefined },
    });
  }
  async deleteWriteoffList(tenantId: string, id: string) {
    await this.require(this.prisma.cleaningWriteoffList, tenantId, id, 'Лист списания');
    await this.prisma.cleaningWriteoffList.delete({ where: { id } });
  }

  // ── Персонал: список и режим «в смене» (§10) ─────────────────────────────
  async staff(tenantId: string) {
    const users = await this.prisma.adminUser.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, email: true, roleKey: true, onDutySince: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({ ...u, onDuty: u.onDutySince != null }));
  }

  // ── Отделы (UserGroup) — для назначения задач на группу ──────────────────
  async groups(tenantId: string) {
    return this.prisma.userGroup.findMany({
      where: { tenantId },
      include: { members: { select: { adminUserId: true } } },
      orderBy: { name: 'asc' },
    });
  }
  async createGroup(tenantId: string, dto: { name: string; color?: string; headUserId?: string; parentId?: string }) {
    return this.prisma.userGroup.create({
      data: { tenantId, name: dto.name, color: dto.color ?? '#6366f1', headUserId: dto.headUserId ?? null, parentId: dto.parentId ?? null },
    });
  }
  async updateGroup(tenantId: string, id: string, dto: { name?: string; color?: string; headUserId?: string | null; parentId?: string | null }) {
    if (dto.parentId && dto.parentId === id) throw new BadRequestException('Отдел не может быть подотделом самого себя');
    return this.prisma.userGroup.update({
      where: { id },
      data: {
        name: dto.name,
        color: dto.color,
        headUserId: dto.headUserId !== undefined ? (dto.headUserId || null) : undefined,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : undefined,
      },
    });
  }
  async deleteGroup(tenantId: string, id: string) {
    await this.prisma.userGroup.delete({ where: { id } });
  }
  async addGroupMember(tenantId: string, groupId: string, userId: string) {
    const grp = await this.prisma.userGroup.findFirst({ where: { id: groupId, tenantId } });
    if (!grp) throw new NotFoundException('Отдел не найден');
    return this.prisma.userGroupMember.upsert({
      where: { groupId_adminUserId: { groupId, adminUserId: userId } },
      create: { groupId, adminUserId: userId },
      update: {},
    });
  }
  async removeGroupMember(tenantId: string, groupId: string, userId: string) {
    await this.prisma.userGroupMember.deleteMany({ where: { groupId, adminUserId: userId } });
  }
  async setDuty(tenantId: string, userId: string, on: boolean) {
    const user = await this.prisma.adminUser.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('Сотрудник не найден');
    await this.prisma.adminUser.update({ where: { id: userId }, data: { onDutySince: on ? new Date() : null } });
    return { onDuty: on };
  }

  // ── DND / просьба уборки (§3.3) ──────────────────────────────────────────
  async setDnd(tenantId: string, roomId: string, until: string | null) {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, tenantId } });
    if (!room) throw new NotFoundException('Номер не найден');
    return this.prisma.room.update({ where: { id: roomId }, data: { dndUntil: until ? new Date(until) : null } });
  }
  async setCleanRequest(tenantId: string, roomId: string, on: boolean) {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, tenantId } });
    if (!room) throw new NotFoundException('Номер не найден');
    return this.prisma.room.update({ where: { id: roomId }, data: { cleanRequestedAt: on ? new Date() : null } });
  }

  // ── SLA-матрица (LQA): severity × источник → нормативы ───────────────────
  slaPolicies(tenantId: string) {
    return this.prisma.opsSlaPolicy.findMany({ where: { tenantId }, orderBy: [{ guestRequest: 'desc' }, { severity: 'asc' }] });
  }
  async saveSlaPolicy(tenantId: string, dto: SaveSlaPolicyDto) {
    const data = { acceptMinutes: dto.acceptMinutes ?? null, dueMinutes: dto.dueMinutes ?? null, enabled: dto.enabled ?? true };
    const existing = await this.prisma.opsSlaPolicy.findFirst({ where: { tenantId, severity: dto.severity, guestRequest: dto.guestRequest } });
    if (existing) return this.prisma.opsSlaPolicy.update({ where: { id: existing.id }, data });
    return this.prisma.opsSlaPolicy.create({ data: { tenantId, severity: dto.severity, guestRequest: dto.guestRequest, ...data } });
  }
  async deleteSlaPolicy(tenantId: string, id: string) {
    await this.require(this.prisma.opsSlaPolicy, tenantId, id, 'SLA-политика');
    await this.prisma.opsSlaPolicy.delete({ where: { id } });
  }

  // ── ППР-циклы (LQA preventive maintenance) ───────────────────────────────
  async pmRules(tenantId: string) {
    const rules = await this.prisma.opsPmRule.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    return Promise.all(rules.map(async (r) => {
      const roomsWhere = { tenantId, active: true, propertyId: r.propertyId ?? undefined, roomTypeId: r.roomTypeId ?? undefined };
      const cutoff = new Date(Date.now() - r.periodDays * 86_400_000);
      const [rooms, open, lastDone] = await Promise.all([
        this.prisma.room.findMany({ where: roomsWhere, select: { id: true } }),
        this.prisma.opsTask.count({ where: { pmRuleId: r.id, status: { notIn: ['DONE', 'CANCELLED'] } } }),
        this.prisma.opsTask.groupBy({
          by: ['roomId'],
          where: { pmRuleId: r.id, status: 'DONE' },
          _max: { completedAt: true },
        }),
      ]);
      const lastMap = new Map(lastDone.map((g) => [g.roomId, g._max.completedAt]));
      let doneInCycle = 0, dueRooms = 0, neverDone = 0;
      for (const room of rooms) {
        const last = lastMap.get(room.id);
        if (last && last >= cutoff) doneInCycle += 1;
        else { dueRooms += 1; if (!last) neverDone += 1; }
      }
      // Прогноз: успеваем ли закрыть очередь текущим темпом до конца цикла.
      const daysToClear = r.perDay > 0 ? Math.ceil(dueRooms / r.perDay) : null;
      return { ...r, stats: { totalRooms: rooms.length, open, doneInCycle, dueRooms, neverDone, daysToClear } };
    }));
  }
  createPmRule(tenantId: string, dto: SavePmRuleDto) {
    return this.prisma.opsPmRule.create({
      data: {
        tenantId, name: dto.name, propertyId: dto.propertyId ?? null, roomTypeId: dto.roomTypeId ?? null,
        periodDays: dto.periodDays, perDay: dto.perDay ?? 2, checklistId: dto.checklistId ?? null,
        groupId: dto.groupId ?? null, tagIds: dto.tagIds ?? [], enabled: dto.enabled ?? true,
      },
    });
  }
  async updatePmRule(tenantId: string, id: string, dto: Partial<SavePmRuleDto>) {
    await this.require(this.prisma.opsPmRule, tenantId, id, 'ППР-правило');
    return this.prisma.opsPmRule.update({
      where: { id },
      data: {
        name: dto.name, periodDays: dto.periodDays, perDay: dto.perDay, tagIds: dto.tagIds, enabled: dto.enabled,
        propertyId: dto.propertyId !== undefined ? (dto.propertyId || null) : undefined,
        roomTypeId: dto.roomTypeId !== undefined ? (dto.roomTypeId || null) : undefined,
        checklistId: dto.checklistId !== undefined ? (dto.checklistId || null) : undefined,
        groupId: dto.groupId !== undefined ? (dto.groupId || null) : undefined,
      },
    });
  }
  async deletePmRule(tenantId: string, id: string) {
    await this.require(this.prisma.opsPmRule, tenantId, id, 'ППР-правило');
    await this.prisma.opsPmRule.delete({ where: { id } });
  }

  // ── Импорт шаблонов из CSV/Excel (колонки TeamJet) ───────────────────────
  /**
   * Формат: Задача;Исполнители;Наблюдатель;Приоритет;Срок;Где;Теги[;Чек-лист].
   * Исполнители/наблюдатель — названия отделов (создаются, если нет); теги создаются;
   * «Важно» → important; срок «+0д 0ч 30мин» → офсет в минутах от создания.
   * Шаблон ищется по названию (обновляется, не дублируется).
   */
  async importTemplates(tenantId: string, buf: Buffer) {
    const rows = this.parseImportRows(buf);
    if (rows.length < 2) throw new BadRequestException('Нет строк для импорта');
    const header = (rows[0] ?? []).map((h) => h.toLowerCase());
    const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
    const cTitle = col('задач', 'название', 'text');
    const cAssignee = col('исполнител');
    const cWatcher = col('наблюдател');
    const cPriority = col('приоритет', 'важно');
    const cDue = col('срок');
    const cTags = col('тег');
    const cChecklist = col('чек-лист', 'чеклист', 'checklist');
    if (cTitle < 0) throw new BadRequestException('Не найдена колонка «Задача»');

    const [groups, tags, checklists, templates] = await Promise.all([
      this.prisma.userGroup.findMany({ where: { tenantId } }),
      this.prisma.opsTag.findMany({ where: { tenantId } }),
      this.prisma.checklist.findMany({ where: { tenantId, archivedAt: null } }),
      this.prisma.opsTaskTemplate.findMany({ where: { tenantId } }),
    ]);
    const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
    const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));
    const tplByName = new Map(templates.map((t) => [t.name.toLowerCase(), t]));
    let createdTags = 0, createdGroups = 0, createdTpl = 0, updatedTpl = 0;
    let paletteIdx = groups.length + tags.length;

    const ensureGroup = async (name: string) => {
      const key = name.toLowerCase();
      const found = groupByName.get(key);
      if (found) return found;
      const g = await this.prisma.userGroup.create({ data: { tenantId, name, color: IMPORT_PALETTE[paletteIdx++ % IMPORT_PALETTE.length]! } });
      groupByName.set(key, g); createdGroups += 1;
      return g;
    };
    const ensureTag = async (name: string) => {
      const key = name.toLowerCase();
      const found = tagByName.get(key);
      if (found) return found;
      const t = await this.prisma.opsTag.create({ data: { tenantId, name, color: IMPORT_PALETTE[paletteIdx++ % IMPORT_PALETTE.length]! } });
      tagByName.set(key, t); createdTags += 1;
      return t;
    };

    for (const row of rows.slice(1)) {
      const title = row[cTitle];
      if (!title) continue;
      const payload: Record<string, unknown> = { title, kind: 'TASK' };
      // Исполнители — отделы (первый = groupId задачи).
      const assignees = (cAssignee >= 0 ? row[cAssignee] ?? '' : '').split(',').map((s) => s.trim()).filter(Boolean);
      if (assignees[0]) payload.groupId = (await ensureGroup(assignees[0])).id;
      // Наблюдатель — руководитель названного отдела (если задан).
      const watcher = cWatcher >= 0 ? (row[cWatcher] ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0] : undefined;
      if (watcher) {
        const wg = await ensureGroup(watcher);
        if (wg.headUserId) payload.watcherIds = [wg.headUserId];
      }
      if (cPriority >= 0 && /важн/i.test(row[cPriority] ?? '')) payload.important = true;
      const offset = this.parseOffsetMinutes(cDue >= 0 ? row[cDue] : undefined);
      if (offset) payload.dueOffsetMinutes = offset;
      const tagNames = (cTags >= 0 ? row[cTags] ?? '' : '').split(',').map((s) => s.trim()).filter(Boolean);
      if (tagNames.length) payload.tagIds = await Promise.all(tagNames.map(async (n) => (await ensureTag(n)).id));
      if (cChecklist >= 0 && row[cChecklist]) {
        const cl = checklists.find((c) => c.name.toLowerCase() === row[cChecklist]!.toLowerCase());
        if (cl) payload.checklistIds = [cl.id];
      }
      const existing = tplByName.get(title.toLowerCase());
      if (existing) {
        await this.prisma.opsTaskTemplate.update({ where: { id: existing.id }, data: { payload: payload as Prisma.InputJsonValue } });
        updatedTpl += 1;
      } else {
        const created = await this.prisma.opsTaskTemplate.create({ data: { tenantId, name: title, payload: payload as Prisma.InputJsonValue } });
        tplByName.set(title.toLowerCase(), created);
        createdTpl += 1;
      }
    }
    return { created: createdTpl, updated: updatedTpl, createdTags, createdGroups };
  }

  /** Строки файла импорта: xlsx — через SheetJS; CSV — вручную (UTF-8 с фолбэком cp1251, разделитель ;/,). */
  private parseImportRows(buf: Buffer): string[][] {
    // XLSX = zip (PK\x03\x04).
    if (buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b) {
      let wb: XLSX.WorkBook;
      try { wb = XLSX.read(buf, { type: 'buffer', raw: false }); } catch { throw new BadRequestException('Не удалось прочитать Excel-файл'); }
      const ws = wb.Sheets[wb.SheetNames[0] ?? ''];
      if (!ws) throw new BadRequestException('Файл пуст');
      return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()));
    }
    let text = buf.toString('utf8');
    if (text.includes('�')) {
      try { text = new TextDecoder('windows-1251').decode(buf); } catch { /* остаёмся на utf8 */ }
    }
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) throw new BadRequestException('Файл пуст');
    const first = lines[0]!;
    const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
    return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
  }

  /** «+0д 0ч 30мин» → минуты; «Любое время»/пусто → undefined. */
  private parseOffsetMinutes(s: string | undefined): number | undefined {
    if (!s || !/\d/.test(s)) return undefined;
    const t = s.toLowerCase();
    const d = /(\d+)\s*д/.exec(t);
    const h = /(\d+)\s*ч/.exec(t);
    const m = /(\d+)\s*мин/.exec(t);
    const total = (d ? Number(d[1]) : 0) * 1440 + (h ? Number(h[1]) : 0) * 60 + (m ? Number(m[1]) : 0);
    return total > 0 ? total : undefined;
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private validateTime(t: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new BadRequestException('Время в формате HH:mm');
  }
  private async require(model: { findFirst: (args: { where: { id: string; tenantId: string } }) => Promise<unknown> }, tenantId: string, id: string, label: string) {
    const found = await model.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException(`${label}: не найдено`);
  }
}
