import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PromocodeType } from '@prisma/client';
import { PromocodeService } from './promocode.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

function service(promocode: unknown) {
  const prisma = {
    promocode: { findUnique: vi.fn().mockResolvedValue(promocode) },
  } as unknown as PrismaService;
  return new PromocodeService(prisma);
}

describe('PromocodeService.applyToBase', () => {
  it('без кода — без скидки', async () => {
    const res = await service(null).applyToBase(undefined, 13000);
    expect(res).toEqual({ finalRub: 13000, discountRub: 0, promocode: null });
  });

  it('процентная скидка', async () => {
    const res = await service({
      id: 'p1',
      code: 'WELCOME10',
      type: PromocodeType.PERCENT,
      value: 10,
      active: true,
      validUntil: null,
      maxUses: null,
      usedCount: 0,
    }).applyToBase('WELCOME10', 13000);
    expect(res.discountRub).toBe(1300);
    expect(res.finalRub).toBe(11700);
  });

  it('фиксированная скидка не больше суммы', async () => {
    const res = await service({
      id: 'p2',
      code: 'MINUS500',
      type: PromocodeType.FIXED,
      value: 500,
      active: true,
      validUntil: null,
      maxUses: null,
      usedCount: 0,
    }).applyToBase('MINUS500', 13000);
    expect(res.discountRub).toBe(500);
    expect(res.finalRub).toBe(12500);
  });

  it('неактивный код — ошибка', async () => {
    await expect(
      service({ code: 'X', active: false, type: 'PERCENT', value: 10, usedCount: 0, maxUses: null, validUntil: null }).applyToBase('X', 1000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('исчерпанный код — ошибка', async () => {
    await expect(
      service({ code: 'X', active: true, type: 'PERCENT', value: 10, usedCount: 5, maxUses: 5, validUntil: null }).applyToBase('X', 1000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
