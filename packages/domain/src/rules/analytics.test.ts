import { describe, expect, it } from 'vitest';
import { computeDerivedKpis } from './analytics.js';

describe('computeDerivedKpis (§19)', () => {
  it('считает доли и средний чек', () => {
    const k = computeDerivedKpis({
      bookings: 10,
      directBookings: 8,
      paidCount: 4,
      paidSumRub: 52000,
      registrations: 20,
      guestsWithBooking: 7,
      guestsWithRepeat: 2,
    });
    expect(k.directShare).toBeCloseTo(0.8);
    expect(k.averageCheckRub).toBe(13000);
    expect(k.conversionRate).toBeCloseTo(0.35);
    expect(k.repeatRate).toBeCloseTo(2 / 7);
  });

  it('не делит на ноль', () => {
    const k = computeDerivedKpis({
      bookings: 0,
      directBookings: 0,
      paidCount: 0,
      paidSumRub: 0,
      registrations: 0,
      guestsWithBooking: 0,
      guestsWithRepeat: 0,
    });
    expect(k).toEqual({ directShare: 0, averageCheckRub: 0, conversionRate: 0, repeatRate: 0 });
  });
});
