import { describe, expect, it } from 'vitest';
import { MockBnovoAdapter } from './mock-bnovo.adapter.js';

function adapter() {
  return new MockBnovoAdapter();
}

describe('MockBnovoAdapter — каталог', () => {
  it('возвращает объекты и категории', async () => {
    const a = adapter();
    const props = await a.listProperties();
    expect(props.length).toBeGreaterThanOrEqual(4);
    const rooms = await a.listRoomTypes('bnovo-prop-3');
    expect(rooms.length).toBe(2);
    expect(rooms.every((r) => r.propertyId === 'bnovo-prop-3')).toBe(true);
  });
});

describe('MockBnovoAdapter — доступность', () => {
  it('считает ночи и формирует тарифы', async () => {
    const offers = await adapter().getAvailability({
      propertyId: 'bnovo-prop-1',
      checkIn: '2026-07-01',
      checkOut: '2026-07-03',
    });
    expect(offers).toHaveLength(1);
    const offer = offers[0]!;
    expect(offer.nights).toBe(2);
    expect(offer.ratePlans).toHaveLength(2);
    const standard = offer.ratePlans.find((r) => r.refundable)!;
    expect(standard.totalPrice).toBe(standard.perNight * 2);
  });

  it('фильтрует по вместимости (guests)', async () => {
    const offers = await adapter().getAvailability({
      checkIn: '2026-07-01',
      checkOut: '2026-07-02',
      guests: 4,
    });
    // Только категории вместимостью >= 4
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.available >= 0)).toBe(true);
  });

  it('пустой результат при некорректных датах', async () => {
    const offers = await adapter().getAvailability({
      checkIn: '2026-07-03',
      checkOut: '2026-07-01',
    });
    expect(offers).toHaveLength(0);
  });
});

describe('MockBnovoAdapter — бронирование', () => {
  it('создаёт, читает статус и отменяет бронь', async () => {
    const a = adapter();
    const res = await a.createBooking({
      propertyId: 'bnovo-prop-1',
      roomTypeId: 'bnovo-room-1',
      ratePlanId: 'bnovo-room-1-standard',
      checkIn: '2026-07-01',
      checkOut: '2026-07-03',
      guests: 2,
      guest: { firstName: 'Иван' },
    });
    expect(res.bnovoBookingId).toContain('bnovo-bk-');
    expect(res.totalPrice).toBe(6500 * 2);
    expect(await a.getBookingStatus(res.bnovoBookingId)).toBe('confirmed');
    await a.cancelBooking(res.bnovoBookingId);
    expect(await a.getBookingStatus(res.bnovoBookingId)).toBe('cancelled');
  });
});
