import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertTransition, generateBookingNumber, nightsBetween } from './booking.util.js';

describe('nightsBetween — дата выезда ночь не занимает (ADR-005)', () => {
  it('2026-08-01 → 2026-08-05 = 4 ночи', () => {
    expect(nightsBetween('2026-08-01', '2026-08-05')).toBe(4);
  });
  it('соседние даты = 1 ночь', () => {
    expect(nightsBetween('2026-08-01', '2026-08-02')).toBe(1);
  });
  it('бросает при выезде ≤ заезда', () => {
    expect(() => nightsBetween('2026-08-05', '2026-08-05')).toThrow(BadRequestException);
    expect(() => nightsBetween('2026-08-05', '2026-08-01')).toThrow(BadRequestException);
  });
});

describe('assertTransition — state machine', () => {
  it('пропускает разрешённый переход', () => {
    expect(() => assertTransition('CONFIRMED', ['CONFIRMED'], 'заезд')).not.toThrow();
  });
  it('бросает недопустимый переход', () => {
    expect(() => assertTransition('CHECKED_OUT', ['PENDING', 'CONFIRMED'], 'отмена')).toThrow(BadRequestException);
  });
});

describe('generateBookingNumber', () => {
  it('формат DHA-YYYYMMDD-XXXXXX', () => {
    expect(generateBookingNumber(new Date('2026-08-01T10:00:00Z'))).toMatch(/^DHA-20260801-[0-9A-F]{6}$/);
  });
});
