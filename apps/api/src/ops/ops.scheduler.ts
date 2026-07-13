import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { CreateOpsTaskDto } from './dto/ops.dto.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CleaningPlanService } from './cleaning-plan.service.js';
import { OpsEvents } from './ops.events.js';
import { OpsPmService } from './ops-pm.service.js';
import { OpsTaskService } from './ops-task.service.js';

/**
 * Фоновые задания модуля (§12.3, БД + @nestjs/schedule, без Redis):
 * 1) ежеминутно — активация PLAN→NEW по scheduledAt, планировщик повторов, автоматизация;
 * 2) ночью — генерация уборок на день по правилам.
 */
@Injectable()
export class OpsScheduler {
  private readonly logger = new Logger(OpsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: OpsTaskService,
    private readonly plan: CleaningPlanService,
    private readonly pm: OpsPmService,
    private readonly events: OpsEvents,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async everyMinute(): Promise<void> {
    try {
      await this.activateScheduled();
      await this.fireRecurring();
      await this.runAutomation();
    } catch (e) {
      this.logger.warn(`ops scheduler: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Генерация уборок на сегодня по правилам (§6.2) + порция ППР-обхода — на все тенанты. */
  @Cron('0 3 * * *')
  async generateDaily(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    const today = new Date().toISOString();
    for (const t of tenants) {
      try {
        const { created } = await this.plan.generate(t.id, today);
        if (created > 0) this.logger.log(`уборки на сегодня: +${created} (tenant ${t.id})`);
      } catch (e) {
        this.logger.warn(`generate cleanings: ${e instanceof Error ? e.message : e}`);
      }
      try {
        const { created } = await this.pm.generate(t.id);
        if (created > 0) this.logger.log(`ППР-задачи: +${created} (tenant ${t.id})`);
      } catch (e) {
        this.logger.warn(`generate pm: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /** Запланированные (§4.6): PLAN c наступившим scheduledAt → NEW + уведомление. */
  private async activateScheduled(): Promise<void> {
    const due = await this.prisma.opsTask.findMany({
      where: { status: 'PLAN', scheduledAt: { lte: new Date() } },
      include: { assignees: true },
      take: 100,
    });
    for (const t of due) {
      await this.prisma.opsTask.update({
        where: { id: t.id },
        data: { status: 'NEW', statusLog: { create: { from: 'PLAN', to: 'NEW', note: 'активирована по расписанию' } } },
      });
      this.events.emit({ kind: 'task_created', taskId: t.id, userIds: t.assignees.map((a) => a.userId), payload: { title: t.title, important: t.important, severity: t.severity } });
    }
  }

  /** Планировщик (§4.7): материализация повторяющихся задач в назначенную минуту. */
  private async fireRecurring(): Promise<void> {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const rules = await this.prisma.opsRecurringRule.findMany({ where: { enabled: true, time: hhmm } });
    for (const rule of rules) {
      const weekday = ((now.getDay() + 6) % 7) + 1; // пн=1
      const monthDay = now.getDate();
      if (rule.startDate && rule.startDate > now) continue; // правило ещё не началось
      if (rule.freq === 'WEEKLY' && !rule.days.includes(weekday)) continue;
      if (rule.freq === 'MONTHLY' && !rule.days.includes(monthDay)) continue;
      if (rule.freq === 'INTERVAL') {
        // Каждые N дней от даты старта (или создания правила).
        const n = rule.intervalDays ?? 1;
        const anchor = this.tasks.day(rule.startDate ?? rule.createdAt);
        const diffDays = Math.floor((this.tasks.day(now).getTime() - anchor.getTime()) / 86_400_000);
        if (diffDays < 0 || diffDays % n !== 0) continue;
      }
      // Идемпотентность: не создавать второй экземпляр в тот же день.
      if (rule.lastFiredAt && rule.lastFiredAt.toDateString() === now.toDateString()) continue;
      const payload = rule.payload as Partial<CreateOpsTaskDto>;
      try {
        const task = await this.tasks.create(rule.tenantId, { ...payload, title: payload.title ?? rule.name, scheduledAt: undefined } as CreateOpsTaskDto);
        await this.prisma.opsTask.update({ where: { id: task.id }, data: { recurringRuleId: rule.id } });
        await this.prisma.opsRecurringRule.update({ where: { id: rule.id }, data: { lastFiredAt: now } });
      } catch (e) {
        this.logger.warn(`recurring ${rule.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /** Автоматизация (§8.1): напоминания и эскалации по таймауту статуса. */
  private async runAutomation(): Promise<void> {
    const rules = await this.prisma.opsAutomationRule.findMany({ where: { enabled: true } });
    if (rules.length === 0) return;
    const now = Date.now();
    for (const rule of rules) {
      const tasks = await this.prisma.opsTask.findMany({
        where: {
          tenantId: rule.tenantId,
          status: rule.status,
          // Условия SLA-эскалаций (LQA): критичность / тег / только гостевые заявки.
          severity: rule.severity ?? undefined,
          guestRequest: rule.guestOnly ? true : undefined,
          tags: rule.tagId ? { some: { tagId: rule.tagId } } : undefined,
        },
        include: { assignees: true, group: { select: { headUserId: true } }, statusLog: { orderBy: { at: 'desc' }, take: 1 } },
        take: 200,
      });
      for (const t of tasks) {
        const enteredAt = t.statusLog[0]?.at ?? t.createdAt;
        if (now - enteredAt.getTime() < rule.afterMinutes * 60_000) continue;
        // Фильтр по группе: исполнитель с указанной ролью (§8.1).
        if (rule.targetRoleKey) {
          const users = await this.prisma.adminUser.findMany({ where: { id: { in: t.assignees.map((a) => a.userId) } }, select: { roleKey: true } });
          if (!users.some((u) => u.roleKey === rule.targetRoleKey)) continue;
        }
        const fire = await this.prisma.opsAutomationFire.findUnique({ where: { taskId_ruleId: { taskId: t.id, ruleId: rule.id } } });
        if (rule.type === 'REMIND') {
          if (fire && (!rule.repeatMinutes || now - fire.lastFiredAt.getTime() < rule.repeatMinutes * 60_000)) continue;
          this.events.emit({ kind: 'reminder', taskId: t.id, userIds: t.assignees.map((a) => a.userId), payload: { title: t.title, rule: rule.name } });
        } else {
          if (fire) continue;
          // Уведомить руководителя (§8.1): кого — определяется notifyTarget (решает случай «исполнители из разных отделов»).
          const targetId = this.resolveNotifyTarget(rule, t);
          if (!targetId) continue;
          // Не переназначаем — добавляем руководителя наблюдателем и уведомляем.
          await this.prisma.opsTaskWatcher.upsert({
            where: { taskId_userId: { taskId: t.id, userId: targetId } },
            create: { taskId: t.id, userId: targetId },
            update: {},
          });
          await this.prisma.opsTaskComment.create({ data: { taskId: t.id, authorId: null, body: `Уведомление руководителя по правилу «${rule.name}»: задача висит в статусе «${t.status}».` } });
          this.events.emit({ kind: 'escalation', taskId: t.id, userIds: [targetId], payload: { title: t.title, rule: rule.name } });
        }
        await this.prisma.opsAutomationFire.upsert({
          where: { taskId_ruleId: { taskId: t.id, ruleId: rule.id } },
          create: { taskId: t.id, ruleId: rule.id },
          update: { lastFiredAt: new Date() },
        });
      }
    }
  }

  /** Кого уведомляет правило «Уведомить руководителя» (§8.1): по отделу задачи / супервайзеру / создателю / явно. */
  private resolveNotifyTarget(
    rule: { notifyTarget: string; escalateToUserId: string | null },
    task: { group: { headUserId: string | null } | null; supervisorId: string | null; createdBy: string | null },
  ): string | null {
    switch (rule.notifyTarget) {
      case 'GROUP_HEAD': return task.group?.headUserId ?? null;
      case 'SUPERVISOR': return task.supervisorId ?? null;
      case 'CREATOR': return task.createdBy ?? null;
      default: return rule.escalateToUserId ?? null;
    }
  }
}
