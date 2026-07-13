import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BookingEngineService } from './booking-engine.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AvailabilityService } from '../pms/availability/availability.service.js';
import { RateService } from '../pms/rates/rate.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { IdempotencyService } from '../pms/bookings/idempotency.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { PromocodeService } from '../promocodes/promocode.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';

function setup() {
  const prisma = {
    guest: { findUnique: vi.fn().mockResolvedValue({ tenantId: 't1', loyaltyTier: 'MEMBER' }) },
    booking: { findUniqueOrThrow: vi.fn() },
    idempotencyKey: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as PrismaService;
  const availability = { assertAndLockForBooking: vi.fn(), search: vi.fn() } as unknown as AvailabilityService;
  const rates = { quote: vi.fn().mockResolvedValue({ totalAmount: 32000, nightsCount: 4, ratePlanId: 'flex', ratePlanName: 'Гибкий', refundable: true }), listPlans: vi.fn() } as unknown as RateService;
  const loyalty = {
    maxRedeemable: vi.fn().mockResolvedValue({ availableBalance: 0, maxPoints: 0 }),
    previewAccrual: vi.fn().mockResolvedValue(960),
    getAvailableBalance: vi.fn().mockResolvedValue(0),
  } as unknown as LoyaltyService;
  const promocodes = { applyToBase: vi.fn().mockResolvedValue({ finalRub: 32000, discountRub: 0, promocode: null }) } as unknown as PromocodeService;
  const payments = { createForBooking: vi.fn() } as unknown as PaymentsService;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const idem = { lookup: vi.fn() } as unknown as IdempotencyService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  const service = new BookingEngineService(prisma, availability, rates, loyalty, promocodes, payments, tenant, idem, audit);
  return { service, prisma, availability, rates, loyalty, promocodes, payments, idem };
}

const dto = { propertyId: 'p1', roomTypeId: 'rt1', ratePlanId: 'flex', checkIn: '2026-08-01', checkOut: '2026-08-05', guests: 2 };

beforeEach(() => vi.clearAllMocks());

describe('BookingEngineService.quote — цена + промокод + лояльность', () => {
  it('без скидок: stayAmount=totalPrice=payable=32000, accrual preview', async () => {
    const { service } = setup();
    const q = await service.quote('g1', dto as never);
    expect(q.stayAmount).toBe(32000);
    expect(q.totalPrice).toBe(32000);
    expect(q.payableAmount).toBe(32000);
    expect(q.promo.applied).toBe(false);
    expect(q.loyalty.accrualPreview).toBe(960);
  });

  it('промокод уменьшает totalPrice и payable', async () => {
    const { service, promocodes } = setup();
    vi.mocked(promocodes.applyToBase).mockResolvedValue({ finalRub: 28800, discountRub: 3200, promocode: { id: 'pc', code: 'DIRECT10' } } as never);
    const q = await service.quote('g1', { ...dto, promoCode: 'DIRECT10' } as never);
    expect(q.totalPrice).toBe(28800);
    expect(q.promo).toMatchObject({ applied: true, discountRub: 3200, code: 'DIRECT10' });
    expect(q.payableAmount).toBe(28800);
  });

  it('списание баллов ограничено лимитом уровня и уменьшает payable', async () => {
    const { service, loyalty } = setup();
    vi.mocked(loyalty.maxRedeemable).mockResolvedValue({ availableBalance: 5000, maxPoints: 4800 });
    const q = await service.quote('g1', { ...dto, pointsToRedeem: 5000 } as never); // просит 5000, лимит 4800
    expect(q.loyalty.requestedRedeem).toBe(4800);
    expect(q.loyalty.redeemDiscountRub).toBe(4800);
    expect(q.payableAmount).toBe(32000 - 4800);
  });
});

describe('BookingEngineService.createBooking — идемпотентность', () => {
  it('повтор с тем же ключом возвращает исходный результат без транзакции', async () => {
    const { service, prisma, idem } = setup();
    vi.mocked(idem.lookup).mockResolvedValue({ response: { booking: { id: 'b1' }, payment: null } } as never);
    const res = (await service.createBooking('g1', dto as never, 'key-1')) as { booking: { id: string } };
    expect(res.booking.id).toBe('b1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('требует заголовок Idempotency-Key', async () => {
    const { service } = setup();
    await expect(service.createBooking('g1', dto as never, '')).rejects.toBeInstanceOf(BadRequestException);
  });
});
