import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ExcelService } from '../warehouse/excel/excel.service.js';
import type { SnapshotItem } from './ops-task.service.js';

const STATUS_RU: Record<string, string> = {
  PLAN: 'План', NEW: 'Новая', ACCEPTED: 'Принята', IN_PROGRESS: 'В работе',
  PAUSED: 'Отложена', DONE: 'Сделана', CANCELLED: 'Отменена',
};

/** Отчёты (§9): дашборд, задачи за период, уборки план/факт. PLAN в отчёты не входит. */
@Injectable()
export class OpsReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  /** Дашборд на сегодня: задачи по статусам, номера по статусам, просроченные, в ремонте. */
  async dashboard(tenantId: string, propertyId?: string) {
    const now = new Date();
    const [byStatus, rooms, overdue, outOfOrder, dnd] = await Promise.all([
      this.prisma.opsTask.groupBy({
        by: ['kind', 'status'],
        where: { tenantId, propertyId, status: { not: 'PLAN' }, OR: [{ completedAt: null }, { completedAt: { gte: new Date(now.getTime() - 86_400_000) } }] },
        _count: true,
      }),
      this.prisma.room.groupBy({ by: ['housekeepingStatus'], where: { tenantId, propertyId, active: true }, _count: true }),
      this.prisma.opsTask.count({ where: { tenantId, propertyId, dueAt: { lt: now }, status: { notIn: ['DONE', 'CANCELLED', 'PLAN'] } } }),
      this.prisma.room.count({ where: { tenantId, propertyId, maintenanceStatus: 'OUT_OF_ORDER', active: true } }),
      this.prisma.room.count({ where: { tenantId, propertyId, dndUntil: { gt: now }, active: true } }),
    ]);
    return {
      tasks: byStatus.map((r) => ({ kind: r.kind, status: r.status, count: r._count })),
      rooms: rooms.map((r) => ({ status: r.housekeepingStatus, count: r._count })),
      overdue, outOfOrder, dnd,
    };
  }

  /**
   * Повторные заявки (LQA): ≥2 задачи по одному номеру с одним тегом (или одинаковым
   * названием, если тегов нет) за период — маркер некачественного ремонта.
   */
  async repeats(tenantId: string, from: string, to: string, propertyId?: string) {
    const start = new Date(from);
    const end = new Date(new Date(to).getTime() + 86_400_000);
    const tasks = await this.prisma.opsTask.findMany({
      where: { tenantId, propertyId, kind: 'TASK', roomId: { not: null }, status: { not: 'PLAN' }, createdAt: { gte: start, lt: end } },
      include: { tags: { include: { tag: true } }, room: { select: { number: true } } },
      orderBy: { createdAt: 'asc' },
    });
    type Item = { id: string; title: string; status: string; createdAt: Date };
    const buckets = new Map<string, { roomId: string; room: string; label: string; items: Item[] }>();
    for (const t of tasks) {
      const item: Item = { id: t.id, title: t.title, status: t.status, createdAt: t.createdAt };
      const keys = t.tags.length
        ? t.tags.map((x) => ({ k: `${t.roomId}|tag:${x.tagId}`, label: x.tag.name }))
        : [{ k: `${t.roomId}|title:${t.title.trim().toLowerCase()}`, label: t.title }];
      for (const { k, label } of keys) {
        const b = buckets.get(k) ?? { roomId: t.roomId!, room: t.room?.number ?? '?', label, items: [] };
        b.items.push(item);
        buckets.set(k, b);
      }
    }
    return [...buckets.values()]
      .filter((b) => b.items.length >= 2)
      .sort((a, b) => b.items.length - a.items.length)
      .map((b) => ({ ...b, count: b.items.length }));
  }

  /** Задачи за период (§9.2): по дням создано/сделано/отменено + среднее время реакции/работы. */
  async tasksReport(tenantId: string, from: string, to: string, propertyId?: string) {
    const start = new Date(from);
    const end = new Date(new Date(to).getTime() + 86_400_000);
    const tasks = await this.prisma.opsTask.findMany({
      where: {
        tenantId, propertyId, status: { not: 'PLAN' },
        OR: [{ createdAt: { gte: start, lt: end } }, { completedAt: { gte: start, lt: end } }],
      },
      select: { id: true, kind: true, status: true, createdAt: true, acceptedAt: true, completedAt: true, workSeconds: true, cancelledBy: true },
    });
    const days = new Map<string, { created: number; done: number; cancelled: number }>();
    for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86_400_000)) {
      days.set(d.toISOString().slice(0, 10), { created: 0, done: 0, cancelled: 0 });
    }
    let reactSum = 0; let reactN = 0; let workSum = 0; let workN = 0;
    for (const t of tasks) {
      const cKey = t.createdAt.toISOString().slice(0, 10);
      if (days.has(cKey)) days.get(cKey)!.created += 1;
      if (t.completedAt) {
        const dKey = t.completedAt.toISOString().slice(0, 10);
        if (days.has(dKey)) {
          if (t.status === 'DONE') days.get(dKey)!.done += 1;
        }
      }
      if (t.status === 'CANCELLED') {
        const key = (t.completedAt ?? t.createdAt).toISOString().slice(0, 10);
        if (days.has(key)) days.get(key)!.cancelled += 1;
      }
      if (t.acceptedAt) { reactSum += (t.acceptedAt.getTime() - t.createdAt.getTime()) / 1000; reactN += 1; }
      if (t.status === 'DONE' && t.workSeconds > 0) { workSum += t.workSeconds; workN += 1; }
    }
    return {
      days: [...days.entries()].map(([date, v]) => ({ date, ...v })),
      avgReactionSeconds: reactN ? Math.round(reactSum / reactN) : null,
      avgWorkSeconds: workN ? Math.round(workSum / workN) : null,
      total: tasks.length,
    };
  }

  /** Уборки за период (§9.3): факт vs норматив, ошибки чек-листов, инспектор. */
  async cleaningsReport(tenantId: string, from: string, to: string, propertyId?: string, userId?: string) {
    const start = new Date(from);
    const end = new Date(new Date(to).getTime() + 86_400_000);
    const [tasks, standards, types, users] = await Promise.all([
      this.prisma.opsTask.findMany({
        where: {
          tenantId, kind: 'CLEANING', propertyId, status: { in: ['DONE', 'IN_PROGRESS', 'NEW', 'ACCEPTED', 'PAUSED'] },
          planDate: { gte: start, lt: end },
          assignees: userId ? { some: { userId } } : undefined,
        },
        include: {
          room: { select: { number: true, roomTypeId: true } },
          assignees: true,
          checklists: { include: { answers: true } },
        },
        orderBy: { planDate: 'asc' },
      }),
      this.prisma.cleaningStandard.findMany({ where: { tenantId } }),
      this.prisma.cleaningType.findMany({ where: { tenantId } }),
      this.prisma.adminUser.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } }),
    ]);
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const userName = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    const standard = (ctId: string | null, rtId: string | null | undefined) => {
      if (!ctId) return null;
      const exact = standards.find((s) => s.cleaningTypeId === ctId && s.roomTypeId === rtId);
      const fb = standards.find((s) => s.cleaningTypeId === ctId && s.roomTypeId === null);
      return exact?.minutes ?? fb?.minutes ?? null;
    };
    return tasks.map((t) => {
      // Ошибки чек-листа — пункты, отмеченные «Нет» (§9.3).
      let errors = 0;
      for (const cl of t.checklists) {
        const items = cl.itemsSnapshot as unknown as SnapshotItem[];
        for (const a of cl.answers) if (a.answer === 'NO' && items.some((i) => i.id === a.itemId)) errors += 1;
      }
      const std = standard(t.cleaningTypeId, t.room?.roomTypeId);
      const factMinutes = t.workSeconds > 0 ? Math.round(t.workSeconds / 60) : null;
      return {
        id: t.id,
        date: t.planDate?.toISOString().slice(0, 10) ?? t.createdAt.toISOString().slice(0, 10),
        room: t.room?.number ?? '—',
        type: (t.cleaningTypeId ? typeName.get(t.cleaningTypeId) : null) ?? t.title,
        assignee: t.assignees[0] ? (userName.get(t.assignees[0].userId) ?? '—') : '—',
        status: t.status,
        statusRu: STATUS_RU[t.status] ?? t.status,
        standardMinutes: std,
        factMinutes,
        exceeded: std != null && factMinutes != null && factMinutes > std,
        errors,
      };
    });
  }

  /**
   * Таймлайн (§9.4): по дням — среднее время реакции (NEW → Принята/В работе) и
   * среднее факт-время выполнения; сравнение с предыдущим днём считает фронт.
   */
  async timeline(tenantId: string, from: string, to: string, propertyId?: string) {
    const start = new Date(from);
    const end = new Date(new Date(to).getTime() + 86_400_000);
    const tasks = await this.prisma.opsTask.findMany({
      where: { tenantId, propertyId, status: { not: 'PLAN' }, createdAt: { gte: start, lt: end } },
      select: {
        id: true, createdAt: true, completedAt: true, status: true, workSeconds: true,
        statusLog: { orderBy: { at: 'asc' }, select: { from: true, to: true, at: true } },
      },
    });
    const days = new Map<string, { created: number; done: number; reactSum: number; reactN: number; workSum: number; workN: number }>();
    for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86_400_000)) {
      days.set(d.toISOString().slice(0, 10), { created: 0, done: 0, reactSum: 0, reactN: 0, workSum: 0, workN: 0 });
    }
    for (const t of tasks) {
      const day = days.get(t.createdAt.toISOString().slice(0, 10));
      if (day) day.created += 1;
      // Реакция: NEW → первый переход в ACCEPTED/IN_PROGRESS.
      const newAt = t.statusLog.find((l) => l.to === 'NEW')?.at ?? t.createdAt;
      const picked = t.statusLog.find((l) => l.from === 'NEW' && (l.to === 'ACCEPTED' || l.to === 'IN_PROGRESS'));
      if (picked && day) { day.reactSum += (picked.at.getTime() - newAt.getTime()) / 1000; day.reactN += 1; }
      if (t.status === 'DONE' && t.completedAt) {
        const dd = days.get(t.completedAt.toISOString().slice(0, 10));
        if (dd) { dd.done += 1; if (t.workSeconds > 0) { dd.workSum += t.workSeconds; dd.workN += 1; } }
      }
    }
    return [...days.entries()].map(([date, v]) => ({
      date,
      created: v.created,
      done: v.done,
      avgReactionSeconds: v.reactN ? Math.round(v.reactSum / v.reactN) : null,
      avgWorkSeconds: v.workN ? Math.round(v.workSum / v.workN) : null,
    }));
  }

  /**
   * Аналитика чек-листов (§5.4): по каждому чек-листу — прохождения (в завершённых задачах),
   * средний % «без ошибок» (оценочные пункты без ответа «Нет»), история прохождений.
   */
  async checklistAnalytics(tenantId: string, from: string, to: string, propertyId?: string) {
    const start = new Date(from);
    const end = new Date(new Date(to).getTime() + 86_400_000);
    const [runs, users] = await Promise.all([
      this.prisma.opsTaskChecklist.findMany({
        where: { task: { tenantId, propertyId, status: 'DONE', completedAt: { gte: start, lt: end } } },
        include: {
          answers: true,
          task: { select: { id: true, title: true, completedAt: true, room: { select: { number: true } }, assignees: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.adminUser.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    const groups = new Map<string, { name: string; runs: { date: string; taskId: string; taskTitle: string; room: string; assignee: string; score: number; errors: number }[] }>();
    for (const run of runs) {
      const items = (run.itemsSnapshot as unknown as SnapshotItem[]).filter((i) => i.kind === 'ITEM' && !i.excludeFromScore);
      if (items.length === 0) continue;
      const ids = new Set(items.map((i) => i.id));
      const errors = run.answers.filter((a) => a.answer === 'NO' && ids.has(a.itemId)).length;
      const score = Math.round(((items.length - errors) / items.length) * 100);
      const key = run.checklistId ?? run.name;
      const g = groups.get(key) ?? { name: run.name, runs: [] };
      g.runs.push({
        date: (run.task.completedAt ?? new Date()).toISOString().slice(0, 10),
        taskId: run.task.id,
        taskTitle: run.task.title,
        room: run.task.room?.number ?? '—',
        assignee: run.task.assignees[0] ? (userName.get(run.task.assignees[0].userId) ?? '—') : '—',
        score,
        errors,
      });
      groups.set(key, g);
    }
    return [...groups.entries()].map(([id, g]) => ({
      checklistId: id,
      name: g.name,
      runs: g.runs.length,
      avgScore: Math.round(g.runs.reduce((s, r) => s + r.score, 0) / g.runs.length),
      totalErrors: g.runs.reduce((s, r) => s + r.errors, 0),
      history: g.runs,
    })).sort((a, b) => b.runs - a.runs);
  }

  /**
   * Отчёты «Pro» (§9, TeamJet): почасовая загрузка (создание задач по часам суток)
   * и статистика по шаблонным/повторяющимся задачам.
   */
  async proReport(tenantId: string, from: string, to: string, propertyId?: string) {
    const start = new Date(from);
    const end = new Date(new Date(to).getTime() + 86_400_000);
    const [tasks, templates, rules] = await Promise.all([
      this.prisma.opsTask.findMany({
        where: { tenantId, propertyId, status: { not: 'PLAN' }, createdAt: { gte: start, lt: end } },
        select: { createdAt: true, workSeconds: true, status: true, templateId: true, recurringRuleId: true, roomId: true, title: true },
      }),
      this.prisma.opsTaskTemplate.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.opsRecurringRule.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);
    const tplName = new Map(templates.map((t) => [t.id, t.name]));
    const ruleName = new Map(rules.map((r) => [r.id, r.name]));
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, templated: 0 }));
    const byTemplate = new Map<string, { name: string; kind: 'template' | 'recurring'; count: number; done: number; workSum: number; workN: number; rooms: Set<string> }>();
    for (const t of tasks) {
      const h = t.createdAt.getHours();
      hours[h]!.total += 1;
      const key = t.templateId ? `t:${t.templateId}` : t.recurringRuleId ? `r:${t.recurringRuleId}` : null;
      if (!key) continue;
      hours[h]!.templated += 1;
      const name = t.templateId ? (tplName.get(t.templateId) ?? t.title) : (ruleName.get(t.recurringRuleId!) ?? t.title);
      const g = byTemplate.get(key) ?? { name, kind: t.templateId ? 'template' as const : 'recurring' as const, count: 0, done: 0, workSum: 0, workN: 0, rooms: new Set<string>() };
      g.count += 1;
      if (t.status === 'DONE') g.done += 1;
      if (t.workSeconds > 0) { g.workSum += t.workSeconds; g.workN += 1; }
      if (t.roomId) g.rooms.add(t.roomId);
      byTemplate.set(key, g);
    }
    return {
      hours,
      templates: [...byTemplate.values()].map((g) => ({
        name: g.name,
        kind: g.kind,
        count: g.count,
        done: g.done,
        avgWorkSeconds: g.workN ? Math.round(g.workSum / g.workN) : null,
        rooms: g.rooms.size,
      })).sort((a, b) => b.count - a.count),
    };
  }

  async tasksExport(tenantId: string, from: string, to: string, propertyId?: string): Promise<Buffer> {
    const report = await this.tasksReport(tenantId, from, to, propertyId);
    return this.excel.build('Задачи', [
      { key: 'date', label: 'Дата' },
      { key: 'created', label: 'Создано' },
      { key: 'done', label: 'Сделано' },
      { key: 'cancelled', label: 'Отменено' },
    ], report.days);
  }

  async cleaningsExport(tenantId: string, from: string, to: string, propertyId?: string, userId?: string): Promise<Buffer> {
    const rows = await this.cleaningsReport(tenantId, from, to, propertyId, userId);
    return this.excel.build('Уборки', [
      { key: 'date', label: 'Дата' },
      { key: 'room', label: 'Номер' },
      { key: 'type', label: 'Тип уборки' },
      { key: 'assignee', label: 'Исполнитель' },
      { key: 'statusRu', label: 'Статус' },
      { key: 'standardMinutes', label: 'Норматив, мин' },
      { key: 'factMinutes', label: 'Факт, мин' },
      { key: 'exceeded', label: 'Превышение' },
      { key: 'errors', label: 'Ошибки чек-листа' },
    ], rows);
  }

  /** Экспорт списка задач (лимит месяц — §4.2). */
  async listExport(tenantId: string, rows: { id: string; title: string; kind: string; status: string; createdAt: Date; dueAt: Date | null; room?: { number: string } | null; assignees: { userId: string }[] }[]): Promise<Buffer> {
    const users = await this.prisma.adminUser.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } });
    const name = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    return this.excel.build('Задачи', [
      { key: 'title', label: 'Задача' },
      { key: 'kind', label: 'Вид' },
      { key: 'room', label: 'Номер' },
      { key: 'status', label: 'Статус' },
      { key: 'assignee', label: 'Исполнитель' },
      { key: 'createdAt', label: 'Создана' },
      { key: 'dueAt', label: 'Срок' },
    ], rows.map((t) => ({
      title: t.title,
      kind: t.kind === 'CLEANING' ? 'Уборка' : 'Задача',
      room: t.room?.number ?? '',
      status: STATUS_RU[t.status] ?? t.status,
      assignee: t.assignees.map((a) => name.get(a.userId) ?? '').join(', '),
      createdAt: t.createdAt,
      dueAt: t.dueAt,
    })));
  }
}
