import { RateAdjustmentType } from '@prisma/client';

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' в UTC — ключ ночи для карт цен/ограничений. */
export function dateKey(value: Date | string): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

/** UTC-полночь как Date. */
export function utcMidnight(value: Date | string): Date {
  return new Date(`${dateKey(value)}T00:00:00Z`);
}

/** Ночи диапазона [checkIn, checkOut) как Date (UTC-полночь). Дата выезда ночь не занимает. */
export function nightDates(checkIn: Date | string, checkOut: Date | string): Date[] {
  const a = utcMidnight(checkIn).getTime();
  const b = utcMidnight(checkOut).getTime();
  const nights: Date[] = [];
  for (let d = a; d < b; d += DAY_MS) nights.push(new Date(d));
  return nights;
}

/**
 * Производная цена (derived rate): база ± корректировка. PERCENT — проценты (напр. −10),
 * FIXED — ₽/ночь (напр. +1500). Округляется до рубля, не опускается ниже 0.
 */
export function applyAdjustment(base: number, type: RateAdjustmentType, value: number): number {
  const raw = type === 'PERCENT' ? base * (1 + value / 100) : base + value;
  return Math.max(0, Math.round(raw));
}
