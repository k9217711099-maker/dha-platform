import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BonusService } from './bonus.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

function setup(over: Record<string, unknown> = {}) {
  const staffBonusAward = {
    create: vi.fn().mockResolvedValue({ id: 'a1', points: 5 }),
    aggregate: vi.fn().mockResolvedValue({ _sum: { points: 12 } }),
    groupBy: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const staffBonusRule = {
    findFirst: vi.fn().mockResolvedValue({ id: 'r1', points: 4 }),
    create: vi.fn().mockResolvedValue({ id: 'r1' }),
  };
  const adminUser = {
    findFirst: vi.fn().mockResolvedValue({ id: 'u1', active: true }),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const prisma = { staffBonusAward, staffBonusRule, adminUser, ...over } as unknown as PrismaService;
  return { service: new BonusService(prisma), staffBonusAward, staffBonusRule, adminUser };
}

beforeEach(() => vi.clearAllMocks());

describe('BonusService.resolveAward — баллы и причина (§7)', () => {
  const svc = setup().service;

  it('явные points имеют приоритет над баллами критерия', () => {
    expect(svc.resolveAward({ rulePoints: 4, points: 10, ruleId: 'r1' }).points).toBe(10);
  });

  it('без points берёт баллы критерия', () => {
    expect(svc.resolveAward({ rulePoints: 4, ruleId: 'r1' }).points).toBe(4);
  });

  it('без points и без критерия — ошибка', () => {
    expect(() => svc.resolveAward({ reason: 'молодец' })).toThrow(BadRequestException);
  });

  it('нулевые баллы отклоняются', () => {
    expect(() => svc.resolveAward({ points: 0, reason: 'x' })).toThrow(BadRequestException);
  });

  it('дробные баллы отклоняются', () => {
    expect(() => svc.resolveAward({ points: 2.5, reason: 'x' })).toThrow(BadRequestException);
  });

  it('свободное начисление без причины отклоняется', () => {
    expect(() => svc.resolveAward({ points: 5 })).toThrow(BadRequestException);
  });

  it('отрицательная корректировка с причиной допускается', () => {
    expect(svc.resolveAward({ points: -3, reason: 'штраф за опоздание' })).toEqual({ points: -3, reason: 'штраф за опоздание' });
  });

  it('начисление по критерию без причины допускается (причина = null)', () => {
    expect(svc.resolveAward({ rulePoints: 4, ruleId: 'r1' }).reason).toBeNull();
  });
});

describe('BonusService.award', () => {
  it('несуществующий сотрудник → NotFound', async () => {
    const { service, adminUser } = setup();
    adminUser.findFirst.mockResolvedValueOnce(null);
    await expect(service.award('t1', 'boss', { userId: 'ghost', points: 5, reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('деактивированный сотрудник → BadRequest', async () => {
    const { service, adminUser } = setup();
    adminUser.findFirst.mockResolvedValueOnce({ id: 'u1', active: false });
    await expect(service.award('t1', 'boss', { userId: 'u1', points: 5, reason: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('несуществующий критерий → NotFound', async () => {
    const { service, staffBonusRule } = setup();
    staffBonusRule.findFirst.mockResolvedValueOnce(null);
    await expect(service.award('t1', 'boss', { userId: 'u1', ruleId: 'bad' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('начисление по критерию использует его баллы и возвращает баланс', async () => {
    const { service, staffBonusAward } = setup();
    const res = await service.award('t1', 'boss', { userId: 'u1', ruleId: 'r1' });
    expect(staffBonusAward.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ points: 4, userId: 'u1', awardedById: 'boss', ruleId: 'r1' }) }),
    );
    expect(res.balance).toBe(12);
  });
});

describe('BonusService.createRule', () => {
  it('пустое название отклоняется', async () => {
    const { service } = setup();
    await expect(service.createRule('t1', { name: '  ', points: 4 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('баллы обязательны и целые', async () => {
    const { service } = setup();
    await expect(service.createRule('t1', { name: 'Помощь гостю' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createRule('t1', { name: 'Помощь гостю', points: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('валидный критерий создаётся', async () => {
    const { service, staffBonusRule } = setup();
    await service.createRule('t1', { name: 'Помощь гостю', points: 3, roleKey: 'ops_maid' });
    expect(staffBonusRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Помощь гостю', points: 3, roleKey: 'ops_maid', active: true }) }),
    );
  });
});
