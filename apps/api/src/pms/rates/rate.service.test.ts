import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { RateService } from './rate.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';

function setup() {
  const prisma = {
    ratePlan: { findFirst: vi.fn() },
    ratePrice: { findMany: vi.fn().mockResolvedValue([]) },
    restriction: { findMany: vi.fn().mockResolvedValue([]) },
    roomType: { findFirst: vi.fn().mockResolvedValue({ propertyId: 'p1' }) },
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  const service = new RateService(prisma, audit);
  return { service, prisma, audit };
}

const flex = { id: 'flex', tenantId: 't1', propertyId: 'p1', name: 'Гибкий', code: 'FLEX', kind: 'FLEXIBLE', active: true, refundable: true, parentRatePlanId: null, adjustmentType: null, adjustmentValue: null };
const nonref = { ...flex, id: 'nonref', name: 'Невозвратный', code: 'NONREF', kind: 'NON_REFUNDABLE', refundable: false, parentRatePlanId: 'flex', adjustmentType: 'PERCENT', adjustmentValue: -10 };
const flexPrices = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map((d) => ({ ratePlanId: 'flex', date: new Date(`${d}T00:00:00Z`), price: 8000 }));
const restr = (date: string, over: Record<string, unknown>) => ({ ratePlanId: 'flex', roomTypeId: 'rt1', date: new Date(`${date}T00:00:00Z`), minStay: null, maxStay: null, stopSell: false, closedToArrival: false, closedToDeparture: false, ...over });
const base = { propertyId: 'p1', roomTypeId: 'rt1', checkIn: '2026-08-01', checkOut: '2026-08-05' };
const code = async (promise: Promise<unknown>) => {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(UnprocessableEntityException);
  return (err.getResponse() as { code: string }).code;
};

beforeEach(() => vi.clearAllMocks());

describe('RateService.quote — расчёт по ночам', () => {
  it('базовый тариф: 4 ночи × 8000 = 32000', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue(flexPrices as never);
    const q = await service.quote('t1', { ...base, ratePlanId: 'flex' });
    expect(q.nightsCount).toBe(4);
    expect(q.stayAmount).toBe(32000);
    expect(q.totalAmount).toBe(32000);
    expect(q.nights).toHaveLength(4);
    expect(q.refundable).toBe(true);
  });

  it('производный тариф Невозвратный = Гибкий −10% → 4 × 7200 = 28800', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(nonref as never).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue(flexPrices as never); // цены только у родителя
    const q = await service.quote('t1', { ...base, ratePlanId: 'nonref' });
    expect(q.stayAmount).toBe(28800);
    expect(q.refundable).toBe(false);
    expect(q.nights[0]?.finalPrice).toBe(7200);
  });
});

describe('RateService.quote — ограничения', () => {
  it('min stay не выполнен → min_stay_failed', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue([flexPrices[0]] as never);
    vi.mocked(prisma.restriction.findMany).mockResolvedValue([restr('2026-08-01', { minStay: 3 })] as never);
    expect(await code(service.quote('t1', { ...base, ratePlanId: 'flex', checkOut: '2026-08-02' }))).toBe('min_stay_failed');
  });

  it('stop sell на ночь → stop_sell_active', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue(flexPrices as never);
    vi.mocked(prisma.restriction.findMany).mockResolvedValue([restr('2026-08-01', { stopSell: true })] as never);
    expect(await code(service.quote('t1', { ...base, ratePlanId: 'flex' }))).toBe('stop_sell_active');
  });

  it('закрыт заезд → closed_to_arrival', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue(flexPrices as never);
    vi.mocked(prisma.restriction.findMany).mockResolvedValue([restr('2026-08-01', { closedToArrival: true })] as never);
    expect(await code(service.quote('t1', { ...base, ratePlanId: 'flex' }))).toBe('closed_to_arrival');
  });

  it('закрыт выезд (дата выезда) → closed_to_departure', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue(flexPrices as never);
    vi.mocked(prisma.restriction.findMany).mockResolvedValue([restr('2026-08-05', { closedToDeparture: true })] as never);
    expect(await code(service.quote('t1', { ...base, ratePlanId: 'flex' }))).toBe('closed_to_departure');
  });

  it('нет цены на ночь → no_price', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.ratePlan.findFirst).mockResolvedValueOnce(flex as never);
    vi.mocked(prisma.ratePrice.findMany).mockResolvedValue([] as never); // цен нет
    expect(await code(service.quote('t1', { ...base, ratePlanId: 'flex' }))).toBe('no_price');
  });
});
