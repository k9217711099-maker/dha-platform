import { describe, expect, it } from 'vitest';
import { maxNightlyOccupancy, rangeNights, rangesOverlap, toUtcDay } from './availability.util.js';

const iv = (start: string, end: string, weight = 1) => ({ start: toUtcDay(start), end: toUtcDay(end), weight });

describe('rangeNights — дата выезда ночь не занимает (ADR-005)', () => {
  it('01→05 = 4 ночи', () => {
    expect(rangeNights('2026-08-01', '2026-08-05')).toHaveLength(4);
  });
  it('соседние даты = 1 ночь', () => {
    expect(rangeNights('2026-08-01', '2026-08-02')).toHaveLength(1);
  });
  it('нулевой/обратный диапазон = 0 ночей', () => {
    expect(rangeNights('2026-08-05', '2026-08-05')).toHaveLength(0);
    expect(rangeNights('2026-08-05', '2026-08-01')).toHaveLength(0);
  });
});

describe('maxNightlyOccupancy', () => {
  const nights = rangeNights('2026-08-01', '2026-08-05'); // ночи 01,02,03,04

  it('нет интервалов → 0', () => {
    expect(maxNightlyOccupancy(nights, [])).toBe(0);
  });

  it('две непересекающиеся между собой брони в окне → пик 1, не 2', () => {
    // 01–02 (ночь 01) и 03–05 (ночи 03,04) не делят ни одной ночи
    expect(maxNightlyOccupancy(nights, [iv('2026-08-01', '2026-08-02'), iv('2026-08-03', '2026-08-05')])).toBe(1);
  });

  it('две брони, делящие ночь → пик 2', () => {
    expect(maxNightlyOccupancy(nights, [iv('2026-08-01', '2026-08-04'), iv('2026-08-03', '2026-08-05')])).toBe(2);
  });

  it('back-to-back заезд в день выезда не конфликтует (эксклюзивный конец)', () => {
    // 01–03 (ночи 01,02) и 03–05 (ночи 03,04) — стык 03 не создаёт занятости
    expect(maxNightlyOccupancy(nights, [iv('2026-08-01', '2026-08-03'), iv('2026-08-03', '2026-08-05')])).toBe(1);
  });

  it('лок с quantity>1 учитывается весом', () => {
    expect(maxNightlyOccupancy(nights, [iv('2026-08-02', '2026-08-03', 3)])).toBe(3);
  });
});

describe('rangesOverlap', () => {
  it('пересечение по ночи → true', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-04', '2026-08-03', '2026-08-06')).toBe(true);
  });
  it('стык (выезд = заезд) → false', () => {
    expect(rangesOverlap('2026-08-01', '2026-08-03', '2026-08-03', '2026-08-05')).toBe(false);
  });
});
