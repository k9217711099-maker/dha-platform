import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

/** Период выборки для баланса/рейтинга: всё время либо текущий календарный месяц. */
export type BonusPeriod = 'all' | 'month';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  roleKey: true,
  position: { select: { name: true } },
} satisfies Prisma.AdminUserSelect;

type UserRowInput = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  roleKey: string | null;
  position: { name: string } | null;
};

/** Публичная форма сотрудника в рейтинге/истории (без ПДн). */
function userRow(u: UserRowInput) {
  return {
    id: u.id,
    name: u.name?.trim() || u.email,
    avatarUrl: u.avatarUrl,
    roleKey: u.roleKey,
    positionName: u.position?.name ?? null,
  };
}

/**
 * Бонусная программа сотрудников (§7) — нематериальное признание.
 * Руководитель начисляет баллы (bonus_award) по критериям из каталога (StaffBonusRule) или
 * свободно с комментарием; сотрудник видит баланс, историю и рейтинг команды (bonus_view).
 * Баланс = сумма points по сотруднику. Записи неизменяемы — журнал (корректировка = новая запись).
 * НЕ путать с баллами лояльности гостей («баллы D»).
 */
@Injectable()
export class BonusService {
  constructor(private readonly prisma: PrismaService) {}

  private monthStart(): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private periodWhere(period?: BonusPeriod): Prisma.StaffBonusAwardWhereInput {
    return period === 'month' ? { createdAt: { gte: this.monthStart() } } : {};
  }

  /**
   * Резолв баллов и причины начисления (чистая логика — юнит-тестируется).
   * Баллы: явные points, иначе rulePoints (из критерия). Причина обязательна без критерия.
   */
  resolveAward(input: {
    rulePoints?: number | null;
    points?: number | null;
    reason?: string | null;
    ruleId?: string | null;
  }): { points: number; reason: string | null } {
    let points = input.points ?? null;
    if (points == null && input.rulePoints != null) points = input.rulePoints;
    if (points == null) throw new BadRequestException('Укажите количество баллов или выберите критерий');
    if (!Number.isInteger(points)) throw new BadRequestException('Баллы — целое число');
    if (points === 0) throw new BadRequestException('Баллы не могут быть нулевыми');
    const reason = (input.reason ?? '').trim() || null;
    if (!input.ruleId && !reason) throw new BadRequestException('Укажите причину начисления');
    return { points, reason };
  }

  /** Баланс сотрудника (сумма баллов) за период. */
  async balanceOf(tenantId: string, userId: string, period?: BonusPeriod): Promise<number> {
    const agg = await this.prisma.staffBonusAward.aggregate({
      where: { tenantId, userId, ...this.periodWhere(period) },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }

  /** Рейтинг команды: все активные сотрудники, отсортированы по баллам за период. */
  async leaderboard(tenantId: string, period: BonusPeriod = 'all') {
    const grouped = await this.prisma.staffBonusAward.groupBy({
      by: ['userId'],
      where: { tenantId, ...this.periodWhere(period) },
      _sum: { points: true },
    });
    const pointsByUser = new Map(grouped.map((g) => [g.userId, g._sum.points ?? 0]));
    const users = await this.prisma.adminUser.findMany({
      where: { tenantId, active: true },
      select: USER_SELECT,
    });
    return users
      .map((u) => ({ ...userRow(u), points: pointsByUser.get(u.id) ?? 0 }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ru'))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /** Список сотрудников для выбора получателя (право bonus_award). */
  async recipients(tenantId: string) {
    const users = await this.prisma.adminUser.findMany({
      where: { tenantId, active: true },
      select: USER_SELECT,
      orderBy: { name: 'asc' },
    });
    return users.map(userRow);
  }

  /** Журнал начислений (для руководителя — по любому сотруднику; для себя — из myOverview). */
  async history(tenantId: string, opts: { userId?: string; from?: string; to?: string; limit?: number }) {
    const where: Prisma.StaffBonusAwardWhereInput = { tenantId };
    if (opts.userId) where.userId = opts.userId;
    if (opts.from || opts.to) {
      where.createdAt = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }
    return this.prisma.staffBonusAward.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 200),
      include: {
        rule: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        awardedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** Сводка «Мои бонусы»: баланс, за месяц, ранг, история, критерии, топ команды. */
  async myOverview(tenantId: string, userId: string) {
    const board = await this.leaderboard(tenantId, 'all');
    const me = board.find((r) => r.id === userId);
    const [monthPoints, history, rules] = await Promise.all([
      this.balanceOf(tenantId, userId, 'month'),
      this.history(tenantId, { userId, limit: 30 }),
      this.listRules(tenantId, { activeOnly: true }),
    ]);
    return {
      balance: me?.points ?? 0,
      monthPoints,
      rank: me?.rank ?? null,
      totalPeople: board.length,
      history,
      rules,
      top: board.slice(0, 10),
    };
  }

  /** Карточка бонусов сотрудника для руководителя. */
  async userCard(tenantId: string, userId: string) {
    const user = await this.prisma.adminUser.findFirst({ where: { id: userId, tenantId }, select: USER_SELECT });
    if (!user) throw new NotFoundException('Сотрудник не найден');
    const board = await this.leaderboard(tenantId, 'all');
    const [monthPoints, history] = await Promise.all([
      this.balanceOf(tenantId, userId, 'month'),
      this.history(tenantId, { userId, limit: 100 }),
    ]);
    return {
      user: userRow(user),
      balance: board.find((r) => r.id === userId)?.points ?? 0,
      monthPoints,
      rank: board.find((r) => r.id === userId)?.rank ?? null,
      history,
    };
  }

  /** Начислить/скорректировать баллы. */
  async award(
    tenantId: string,
    actorId: string,
    dto: { userId: string; ruleId?: string; points?: number; reason?: string },
  ) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id: dto.userId, tenantId },
      select: { id: true, active: true },
    });
    if (!user) throw new NotFoundException('Сотрудник не найден');
    if (!user.active) throw new BadRequestException('Сотрудник деактивирован');

    let rule: { id: string; points: number } | null = null;
    if (dto.ruleId) {
      rule = await this.prisma.staffBonusRule.findFirst({
        where: { id: dto.ruleId, tenantId },
        select: { id: true, points: true },
      });
      if (!rule) throw new NotFoundException('Критерий не найден');
    }

    const { points, reason } = this.resolveAward({
      rulePoints: rule?.points,
      points: dto.points ?? null,
      reason: dto.reason,
      ruleId: dto.ruleId ?? null,
    });

    const award = await this.prisma.staffBonusAward.create({
      data: {
        tenantId,
        userId: dto.userId,
        awardedById: actorId,
        ruleId: rule?.id ?? null,
        points,
        reason,
      },
      include: {
        rule: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        awardedBy: { select: { id: true, name: true, email: true } },
      },
    });
    const balance = await this.balanceOf(tenantId, dto.userId, 'all');
    return { award, balance };
  }

  // --- Критерии (каталог) ---

  listRules(tenantId: string, opts?: { activeOnly?: boolean }) {
    return this.prisma.staffBonusRule.findMany({
      where: { tenantId, ...(opts?.activeOnly ? { active: true } : {}) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createRule(tenantId: string, dto: { name?: string; points?: number; roleKey?: string; active?: boolean; order?: number }) {
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Укажите название критерия');
    if (dto.points == null || !Number.isInteger(dto.points)) throw new BadRequestException('Укажите баллы (целое число)');
    return this.prisma.staffBonusRule.create({
      data: {
        tenantId,
        name,
        points: dto.points,
        roleKey: dto.roleKey?.trim() || null,
        active: dto.active ?? true,
        order: dto.order ?? 0,
      },
    });
  }

  async updateRule(tenantId: string, id: string, dto: { name?: string; points?: number; roleKey?: string; active?: boolean; order?: number }) {
    const existing = await this.prisma.staffBonusRule.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Критерий не найден');
    const data: Prisma.StaffBonusRuleUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Название не может быть пустым');
      data.name = name;
    }
    if (dto.points !== undefined) {
      if (!Number.isInteger(dto.points)) throw new BadRequestException('Баллы — целое число');
      data.points = dto.points;
    }
    if (dto.roleKey !== undefined) data.roleKey = dto.roleKey?.trim() || null;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.order !== undefined) data.order = dto.order;
    return this.prisma.staffBonusRule.update({ where: { id }, data });
  }

  async deleteRule(tenantId: string, id: string) {
    const existing = await this.prisma.staffBonusRule.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Критерий не найден');
    await this.prisma.staffBonusRule.delete({ where: { id } });
    return { ok: true };
  }
}
