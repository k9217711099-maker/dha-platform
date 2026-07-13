import { BadRequestException, Injectable } from '@nestjs/common';
import { CleaningRuleCondition, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { OpsEvents } from './ops.events.js';
import { OpsTaskService, TASK_INCLUDE } from './ops-task.service.js';
import type { PlanAutoDto, PlanSendDto } from './dto/ops.dto.js';

const DEFAULT_MINUTES = 30;

/** План уборок (§6.3): распределение, автораспределение, отправка; генерация по правилам (§6.2). */
@Injectable()
export class CleaningPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: OpsTaskService,
    private readonly audit: AuditService,
    private readonly events: OpsEvents,
  ) {}

  /** Экран плана: уборки дня + сотрудники в смене + нормативы. */
  async plan(tenantId: string, dateISO: string, propertyId?: string) {
    const date = this.tasks.day(new Date(dateISO));
    const [items, users, standards, types] = await Promise.all([
      this.prisma.opsTask.findMany({
        where: { tenantId, kind: 'CLEANING', planDate: date, propertyId, status: { not: 'CANCELLED' } },
        include: TASK_INCLUDE,
        orderBy: [{ planOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.adminUser.findMany({
        where: { tenantId, active: true, onDutySince: { not: null } },
        select: { id: true, name: true, email: true, roleKey: true },
      }),
      this.prisma.cleaningStandard.findMany({ where: { tenantId } }),
      this.prisma.cleaningType.findMany({ where: { tenantId, archivedAt: null } }),
    ]);
    const minutes = (cleaningTypeId: string | null, roomTypeId: string | null | undefined): number => {
      if (!cleaningTypeId) return DEFAULT_MINUTES;
      const exact = standards.find((s) => s.cleaningTypeId === cleaningTypeId && s.roomTypeId === roomTypeId);
      const fallback = standards.find((s) => s.cleaningTypeId === cleaningTypeId && s.roomTypeId === null);
      return exact?.minutes ?? fallback?.minutes ?? DEFAULT_MINUTES;
    };
    return {
      date: date.toISOString().slice(0, 10),
      tasks: items.map((t) => ({ ...t, standardMinutes: minutes(t.cleaningTypeId, t.room?.roomTypeId) })),
      users,
      types,
    };
  }

  /** Назначить/переназначить уборку (drag&drop). userId=null — вернуть в нераспределённые. */
  async assign(tenantId: string, taskId: string, userId: string | null, planOrder: number | undefined, actorId: string) {
    const task = await this.tasks.getRaw(tenantId, taskId);
    if (task.kind !== 'CLEANING') throw new BadRequestException('Не уборка');
    const updated = await this.prisma.opsTask.update({
      where: { id: taskId },
      data: {
        planOrder: planOrder ?? null,
        assignees: { deleteMany: {}, ...(userId ? { create: [{ userId }] } : {}) },
      },
      include: TASK_INCLUDE,
    });
    await this.audit.record({ tenantId, actorId, action: 'plan_assign', entity: 'OpsTask', entityId: taskId, payload: { userId } });
    return updated;
  }

  /** Автораспределение (§6.3, §7-D): по секциям (area affinity — вся секция одному сотруднику),
   *  с балансом по нормативной загрузке («кредиты») и приоритетом выезд-под-заезд → выезд → заезд. */
  async autodistribute(tenantId: string, dto: PlanAutoDto, actorId: string) {
    if (dto.userIds.length === 0) throw new BadRequestException('Не выбраны горничные');
    const date = this.tasks.day(new Date(dto.date));
    const next = new Date(date.getTime() + 86_400_000);
    const { tasks } = await this.plan(tenantId, dto.date, dto.propertyId);
    type PlanTask = (typeof tasks)[number];

    // Брони дня → флаги выезд/заезд по номеру (для приоритета back-to-back).
    const bookings = await this.prisma.booking.findMany({
      where: { tenantId, roomId: { not: null }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] }, checkIn: { lt: next }, checkOut: { gte: date } },
      select: { roomId: true, checkIn: true, checkOut: true },
    });
    const sameDay = (d: Date) => this.tasks.day(d).getTime() === date.getTime();
    const flag = new Map<string, { out: boolean; in: boolean }>();
    for (const b of bookings) {
      if (!b.roomId) continue;
      const f = flag.get(b.roomId) ?? { out: false, in: false };
      if (sameDay(b.checkOut)) f.out = true;
      if (sameDay(b.checkIn)) f.in = true;
      flag.set(b.roomId, f);
    }
    const priority = (t: PlanTask): number => {
      const f = t.roomId ? flag.get(t.roomId) : undefined;
      if (f?.out && f?.in) return 3; // выезд-под-заезд — высший приоритет
      if (f?.out || t.room?.cleanRequestedAt) return 2; // выезд / просьба гостя
      if (f?.in) return 1; // заезд
      return 0; // проживание/прочее
    };

    const load = new Map<string, number>(dto.userIds.map((u) => [u, 0]));
    for (const t of tasks) { const a = t.assignees[0]?.userId; if (a && load.has(a)) load.set(a, (load.get(a) ?? 0) + t.standardMinutes); }

    // Группировка нераспределённых по секции (нет секции — по этажу): вся секция одному сотруднику.
    const unassigned = tasks.filter((t) => t.assignees.length === 0 && t.status === 'PLAN');
    const bySection = new Map<string, PlanTask[]>();
    for (const t of unassigned) {
      const key = t.room?.sectionId ?? `floor:${t.room?.floor ?? '—'}`;
      const arr = bySection.get(key); if (arr) arr.push(t); else bySection.set(key, [t]);
    }
    // Порядок секций: по макс. приоритету внутри, затем по ключу.
    const sections = [...bySection.entries()]
      .map(([key, ts]) => ({ key, ts, pr: Math.max(...ts.map(priority)) }))
      .sort((a, b) => b.pr - a.pr || a.key.localeCompare(b.key));

    const orders = new Map<string, number>();
    let assigned = 0;
    for (const sec of sections) {
      const [userId] = [...load.entries()].sort((x, y) => x[1] - y[1])[0]!; // наименее загруженный на момент секции
      const ordered = sec.ts.sort((a, b) => priority(b) - priority(a) || (a.room?.number ?? '').localeCompare(b.room?.number ?? '', 'ru', { numeric: true }));
      for (const t of ordered) {
        load.set(userId, (load.get(userId) ?? 0) + t.standardMinutes);
        const order = (orders.get(userId) ?? 0) + 1; orders.set(userId, order);
        await this.prisma.opsTask.update({ where: { id: t.id }, data: { planOrder: order, assignees: { deleteMany: {}, create: [{ userId }] } } });
        assigned += 1;
      }
    }
    await this.audit.record({ tenantId, actorId, action: 'plan_autodistribute', entity: 'CleaningPlan', entityId: dto.date, payload: { count: assigned, sections: sections.length } });
    return this.plan(tenantId, dto.date, dto.propertyId);
  }

  /** «Отправить задания» (§6.3): PLAN-уборки с исполнителем → NEW + уведомление. */
  async send(tenantId: string, dto: PlanSendDto, actorId: string) {
    const date = this.tasks.day(new Date(dto.date));
    const where: Prisma.OpsTaskWhereInput = {
      tenantId, kind: 'CLEANING', planDate: date, status: 'PLAN', propertyId: dto.propertyId,
      assignees: dto.userId ? { some: { userId: dto.userId } } : { some: {} },
    };
    const toSend = await this.prisma.opsTask.findMany({ where, include: { assignees: true } });
    for (const t of toSend) {
      await this.prisma.opsTask.update({
        where: { id: t.id },
        data: { status: 'NEW', statusLog: { create: { from: 'PLAN', to: 'NEW', actorId, note: 'задания отправлены' } } },
      });
      this.events.emit({ kind: 'task_created', taskId: t.id, userIds: t.assignees.map((a) => a.userId), payload: { title: t.title } });
    }
    await this.audit.record({ tenantId, actorId, action: 'plan_send', entity: 'CleaningPlan', entityId: dto.date, payload: { count: toSend.length } });
    return { sent: toSend.length };
  }

  /** Отмена незавершённых уборок дня (всех или конкретного сотрудника). */
  async cancel(tenantId: string, dto: PlanSendDto, actorId: string) {
    const date = this.tasks.day(new Date(dto.date));
    const items = await this.prisma.opsTask.findMany({
      where: {
        tenantId, kind: 'CLEANING', planDate: date, propertyId: dto.propertyId,
        status: { in: ['PLAN', 'NEW', 'ACCEPTED', 'PAUSED'] },
        assignees: dto.userId ? { some: { userId: dto.userId } } : undefined,
      },
    });
    for (const t of items) {
      await this.prisma.opsTask.update({
        where: { id: t.id },
        data: { status: 'CANCELLED', cancelledBy: actorId, statusLog: { create: { from: t.status, to: 'CANCELLED', actorId, note: 'план уборок отменён' } } },
      });
    }
    await this.audit.record({ tenantId, actorId, action: 'plan_cancel', entity: 'CleaningPlan', entityId: dto.date, payload: { count: items.length } });
    return { cancelled: items.length };
  }

  /**
   * Генерация уборок на день по правилам (§6.2). Идемпотентна: если по номеру на дату уже
   * есть неотменённая уборка — пропускаем. Создаёт в статусе PLAN (в план до отправки),
   * без побочных эффектов на статус номера (грязным номер делает выезд, см. checkOut).
   */
  async generate(tenantId: string, dateISO: string, propertyId?: string): Promise<{ created: number }> {
    const date = this.tasks.day(new Date(dateISO));
    const next = new Date(date.getTime() + 86_400_000);
    const [rules, rooms, bookings, types, existing] = await Promise.all([
      this.prisma.cleaningRule.findMany({ where: { tenantId, enabled: true, OR: [{ propertyId: null }, { propertyId }] } }),
      this.prisma.room.findMany({ where: { tenantId, active: true, propertyId }, select: { id: true, propertyId: true, roomTypeId: true } }),
      this.prisma.booking.findMany({
        where: {
          tenantId, roomId: { not: null }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
          checkIn: { lt: next }, checkOut: { gte: date },
        },
        select: { roomId: true, checkIn: true, checkOut: true, status: true, ratePlanId: true, promoCode: true },
      }),
      this.prisma.cleaningType.findMany({ where: { tenantId, archivedAt: null } }),
      this.prisma.opsTask.findMany({ where: { tenantId, kind: 'CLEANING', planDate: date, status: { not: 'CANCELLED' } }, select: { roomId: true } }),
    ]);
    if (rules.length === 0) return { created: 0 };
    const typeById = new Map(types.map((t) => [t.id, t]));
    const busy = new Set(existing.map((e) => e.roomId));
    const sameDay = (a: Date) => this.tasks.day(a).getTime() === date.getTime();

    let created = 0;
    for (const room of rooms) {
      if (busy.has(room.id)) continue;
      const bs = bookings.filter((b) => b.roomId === room.id);
      const checkout = bs.find((b) => sameDay(b.checkOut));
      const checkin = bs.find((b) => sameDay(b.checkIn));
      const staying = bs.find((b) => b.status === 'CHECKED_IN' && this.tasks.day(b.checkIn) < date && this.tasks.day(b.checkOut) > date);
      let condition: CleaningRuleCondition;
      let stayNights = 0;
      if (checkout && checkin) condition = 'BACK_TO_BACK';
      else if (checkout) condition = 'TODAY_CHECKOUT';
      else if (checkin) condition = 'TODAY_CHECKIN';
      else if (staying) {
        condition = 'OCCUPIED';
        stayNights = Math.round((date.getTime() - this.tasks.day(staying.checkIn).getTime()) / 86_400_000);
      } else condition = 'VACANT';
      // Бронь, к которой относится уборка (для правил по тарифу/промокоду, §6.2 v2):
      // выезд — уезжающий гость; заезд/back-to-back — заезжающий; occupied — живущий.
      const contextBooking = condition === 'TODAY_CHECKOUT' ? checkout : condition === 'OCCUPIED' ? staying : (checkin ?? checkout);

      const candidates = rules.filter((r) =>
        r.condition === condition
        && (!r.roomTypeId || r.roomTypeId === room.roomTypeId)
        && (condition !== 'OCCUPIED' || !r.minStayNights || (stayNights > 0 && stayNights % r.minStayNights === 0))
        && (!r.ratePlanId || r.ratePlanId === contextBooking?.ratePlanId)
        && (!r.promoCode || (contextBooking?.promoCode ?? '').toLowerCase() === r.promoCode.toLowerCase()),
      );
      if (candidates.length === 0) continue;
      // При пересечении побеждает более специфичное правило (§6.2).
      const specificity = (r: (typeof candidates)[number]) =>
        Number(Boolean(r.roomTypeId)) + Number(Boolean(r.minStayNights)) + Number(Boolean(r.ratePlanId)) + Number(Boolean(r.promoCode));
      const rule = candidates.sort((a, b) => specificity(b) - specificity(a))[0]!;
      const type = typeById.get(rule.cleaningTypeId);
      if (!type) continue;
      await this.prisma.opsTask.create({
        data: {
          tenantId, kind: 'CLEANING', status: 'PLAN', title: type.name,
          propertyId: room.propertyId, roomId: room.id, cleaningTypeId: type.id, planDate: date,
          statusLog: { create: { from: 'PLAN', to: 'PLAN', note: `правило: ${condition}` } },
        },
      });
      created += 1;
    }
    return { created };
  }
}
