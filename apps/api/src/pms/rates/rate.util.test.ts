import { describe, expect, it } from 'vitest';
import { applyAdjustment, dateKey, nightDates } from './rate.util.js';

describe('nightDates / dateKey — дата выезда ночь не занимает', () => {
  it('01→05 = 4 ночи с ключами', () => {
    const nights = nightDates('2026-08-01', '2026-08-05');
    expect(nights.map(dateKey)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
  });
  it('нулевой диапазон = 0 ночей', () => {
    expect(nightDates('2026-08-05', '2026-08-05')).toHaveLength(0);
  });
});

describe('applyAdjustment — derived rate', () => {
  it('PERCENT −10% от 10000 = 9000 (Невозвратный)', () => {
    expect(applyAdjustment(10000, 'PERCENT', -10)).toBe(9000);
  });
  it('FIXED +1500 к 10000 = 11500 (Завтрак включён)', () => {
    expect(applyAdjustment(10000, 'FIXED', 1500)).toBe(11500);
  });
  it('округляет до рубля', () => {
    expect(applyAdjustment(9999, 'PERCENT', -10)).toBe(8999); // 8999.1 → 8999
  });
  it('не опускается ниже 0', () => {
    expect(applyAdjustment(1000, 'FIXED', -5000)).toBe(0);
  });
});
