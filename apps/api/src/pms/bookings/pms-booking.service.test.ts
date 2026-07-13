import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PmsBookingService } from './pms-booking.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { RateService } from '../rates/rate.service.js';

function setup() {
  const prisma = {
    booking: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  const idem = { lookup: vi.fn() } as unknown as IdempotencyService;
  const availability = { assertAndLockForBooking: vi.fn() } as unknown as AvailabilityService;
  const rates = { quote: vi.fn() } as unknown as RateService;
  const service = new PmsBookingService(prisma, audit, idem, availability, rates);
  return { service, prisma, audit, idem, availability, rates };
}

const dto = { propertyId: 'p1', roomTypeId: 'rt1', checkIn: '2026-08-01', checkOut: '2026-08-03', guests: 2, totalPrice: 10000 };
const withStatus = (status: string) => ({ id: 'b1', tenantId: 't1', propertyId: 'p1', roomId: null, status, checkIn: new Date(), checkOut: new Date() });

describe('PmsBookingService.create — идемпотентность', () => {
  it('повтор с тем же ключом возвращает исходный результат без транзакции', async () => {
    const { service, prisma, idem } = setup();
    vi.mocked(idem.lookup).mockResolvedValue({ response: { id: 'b1', bookingNumber: 'DHA-x' } } as never);
    const res = await service.create('t1', dto as never, 'a1', 'key-1');
    expect(res).toMatchObject({ id: 'b1' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('требует заголовок Idempotency-Key', async () => {
    const { service } = setup();
    await expect(service.create('t1', dto as never, 'a1', '')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PmsBookingService — переходы статусов', () => {
  it('нельзя отменить выехавшую бронь (CHECKED_OUT)', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(withStatus('CHECKED_OUT') as never);
    await expect(service.cancel('t1', 'b1', {}, 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('заезд возможен только из CONFIRMED', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(withStatus('PENDING') as never);
    await expect(service.checkIn('t1', 'b1', {}, 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('выезд возможен только из CHECKED_IN', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(withStatus('CONFIRMED') as never);
    await expect(service.checkOut('t1', 'b1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

beforeEach(() => vi.clearAllMocks());
