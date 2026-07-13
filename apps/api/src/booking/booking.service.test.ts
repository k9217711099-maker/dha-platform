import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { BookingService } from './booking.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { BnovoPort } from '../integrations/bnovo/bnovo.port.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { CrmService } from '../crm/crm.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PromocodeService } from '../promocodes/promocode.service.js';

const isoIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const roomType = {
  id: 'rt1',
  bnovoId: 'b-rt1',
  propertyId: 'p1',
  active: true,
  name: 'Студия',
  property: { bnovoId: 'b-p1', name: 'D Studio', address: 'Невский 22' },
};

const offer = {
  roomTypeId: 'b-rt1',
  available: 3,
  nights: 2,
  minNights: 1,
  ratePlans: [
    {
      id: 'rp1',
      name: 'Стандарт',
      perNight: 6500,
      totalPrice: 13000,
      refundable: true,
      cancellationPolicy: 'Бесплатная отмена',
    },
  ],
};

function setup() {
  const tx = {
    booking: {
      create: vi.fn().mockResolvedValue({ id: 'bk-db' }),
      update: vi.fn(),
    },
    pointTransaction: { create: vi.fn() },
  };
  const prisma = {
    roomType: { findUnique: vi.fn().mockResolvedValue(roomType) },
    guest: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'g1',
        loyaltyTier: 'MEMBER',
        email: 'a@b.ru',
        firstName: 'Иван',
        lastName: null,
        phone: null,
      }),
    },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  const bnovo = {
    getAvailability: vi.fn().mockResolvedValue([offer]),
    createBooking: vi.fn().mockResolvedValue({ bnovoBookingId: 'bk1', status: 'confirmed', totalPrice: 13000 }),
  } as unknown as BnovoPort;
  const loyalty = {
    getAvailableBalance: vi.fn().mockResolvedValue(0),
    reserveAccrual: vi.fn().mockResolvedValue(390),
    redeem: vi.fn(),
    extendActivePoints: vi.fn().mockResolvedValue(undefined),
  } as unknown as LoyaltyService;
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
  const payments = { refundForBooking: vi.fn() } as unknown as PaymentsService;
  const crm = { syncBooking: vi.fn().mockResolvedValue(undefined) } as unknown as CrmService;
  const promocodes = {
    applyToBase: vi.fn().mockResolvedValue({ finalRub: 13000, discountRub: 0, promocode: null }),
    markUsed: vi.fn(),
  } as unknown as PromocodeService;
  const extras = {
    attachToBooking: vi.fn().mockResolvedValue(0),
  } as unknown as import('../extras/extras.service.js').ExtrasService;
  return {
    service: new BookingService(prisma, bnovo, loyalty, payments, crm, notifications, promocodes, extras),
    prisma,
    bnovo,
    loyalty,
    notifications,
    tx,
  };
}

const dto = { roomTypeId: 'rt1', ratePlanId: 'rp1', checkIn: isoIn(7), checkOut: isoIn(9), guests: 2 };

beforeEach(() => vi.clearAllMocks());

describe('BookingService.create', () => {
  it('конфликт при отсутствии доступности', async () => {
    const { service, bnovo } = setup();
    vi.mocked(bnovo.getAvailability).mockResolvedValue([]);
    await expect(service.create('g1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('конфликт при недоступном тарифе', async () => {
    const { service } = setup();
    await expect(service.create('g1', { ...dto, ratePlanId: 'unknown' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('создаёт бронь в Bnovo, резервирует баллы и возвращает раздел UPCOMING', async () => {
    const { service, bnovo, loyalty, tx } = setup();
    vi.mocked(tx.booking.update).mockResolvedValue({
      id: 'bk-db',
      status: 'CONFIRMED',
      paymentStatus: 'NOT_PAID',
      propertyId: 'p1',
      checkIn: new Date(dto.checkIn),
      checkOut: new Date(dto.checkOut),
      nights: 2,
      guests: 2,
      ratePlanName: 'Стандарт',
      refundable: true,
      cancellationPolicy: 'Бесплатная отмена',
      totalPrice: 13000,
      pointsReserved: 390,
      pointsRedeemed: 0,
      extrasTotal: 0,
      createdAt: new Date(),
      property: { name: 'D Studio', address: 'Невский 22' },
      roomType: { name: 'Студия' },
      extras: [],
    } as never);

    const view = await service.create('g1', dto);

    expect(bnovo.createBooking).toHaveBeenCalledOnce();
    expect(loyalty.reserveAccrual).toHaveBeenCalledOnce();
    expect(view.section).toBe('UPCOMING');
    expect(view.totalPrice).toBe(13000);
    expect(view.payableAmount).toBe(13000);
  });
});
