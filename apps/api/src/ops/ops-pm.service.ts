import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { OpsTaskService } from './ops-task.service.js';

/**
 * ППР-циклы (LQA preventive maintenance): циклический профилактический обход
 * номерного фонда. Каждый номер проходит осмотр по чек-листу раз в periodDays;
 * генератор создаёт задачи порциями perDay, предпочитая свободные сегодня номера
 * и номера с самой давней профилактикой. Давность = последняя DONE-задача правила
 * по номеру; открытая задача правила блокирует повторное создание (идемпотентность).
 */
@Injectable()
export class OpsPmService {
  private readonly logger = new Logger(OpsPmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: OpsTaskService,
  ) {}

  /** Генерация порции ППР-задач (cron ежедневно или кнопка «Сгенерировать»). */
  async generate(tenantId: string, ruleId?: string): Promise<{ created: number }> {
    const rules = await this.prisma.opsPmRule.findMany({ where: { tenantId, enabled: true, id: ruleId } });
    const today = this.tasks.day(new Date());
    const tomorrow = new Date(today.getTime() + 86_400_000);
    let created = 0;

    for (const rule of rules) {
      const rooms = await this.prisma.room.findMany({
        where: { tenantId, active: true, propertyId: rule.propertyId ?? undefined, roomTypeId: rule.roomTypeId ?? undefined },
        select: { id: true, number: true },
      });
      if (rooms.length === 0) continue;
      const ids = rooms.map((r) => r.id);

      const [open, lastDone, busy] = await Promise.all([
        this.prisma.opsTask.findMany({
          where: { pmRuleId: rule.id, roomId: { in: ids }, status: { notIn: ['DONE', 'CANCELLED'] } },
          select: { roomId: true },
        }),
        this.prisma.opsTask.groupBy({
          by: ['roomId'],
          where: { pmRuleId: rule.id, roomId: { in: ids }, status: 'DONE' },
          _max: { completedAt: true },
        }),
        // Занятость сегодня: предпочитаем свободные номера (гостя не беспокоим).
        this.prisma.booking.findMany({
          where: { tenantId, roomId: { in: ids }, status: { in: ['CONFIRMED', 'CHECKED_IN'] }, checkIn: { lt: tomorrow }, checkOut: { gt: today } },
          select: { roomId: true },
        }),
      ]);
      const openSet = new Set(open.map((o) => o.roomId));
      const lastMap = new Map(lastDone.map((g) => [g.roomId, g._max.completedAt]));
      const occupied = new Set(busy.map((b) => b.roomId));
      const cutoff = new Date(Date.now() - rule.periodDays * 86_400_000);

      const candidates = rooms
        .filter((r) => !openSet.has(r.id))
        .filter((r) => { const last = lastMap.get(r.id); return !last || last < cutoff; })
        .sort((a, b) =>
          Number(occupied.has(a.id)) - Number(occupied.has(b.id))
          || (lastMap.get(a.id)?.getTime() ?? 0) - (lastMap.get(b.id)?.getTime() ?? 0)
          || a.number.localeCompare(b.number, 'ru', { numeric: true }));

      for (const room of candidates.slice(0, rule.perDay)) {
        try {
          const task = await this.tasks.create(tenantId, {
            title: `${rule.name} — №${room.number}`,
            description: `Плановый профилактический осмотр (ППР, цикл ${rule.periodDays} дн.).`,
            roomId: room.id,
            groupId: rule.groupId ?? undefined,
            tagIds: rule.tagIds,
            checklistIds: rule.checklistId ? [rule.checklistId] : undefined,
          });
          await this.prisma.opsTask.update({ where: { id: task.id }, data: { pmRuleId: rule.id } });
          created += 1;
        } catch (e) {
          this.logger.warn(`pm ${rule.name} №${room.number}: ${e instanceof Error ? e.message : e}`);
        }
      }
      await this.prisma.opsPmRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
    }
    return { created };
  }
}
