import { BadRequestException } from '@nestjs/common';

const DAY_MS = 86_400_000;

/** Нормализует дату (или ISO-строку) к UTC-полуночи и возвращает ms — «ключ ночи». */
export function toUtcDay(value: Date | string): number {
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) throw new BadRequestException('Некорректная дата');
  return t;
}

/**
 * Занятый интервал (бронь / лок / блокировка) в «днях-ночах». `end` — эксклюзивный:
 * дата выезда/окончания ночь не занимает (DHP ADR-005). `weight` — сколько единиц
 * размещения занимает (лок может держать несколько, бронь/блок — 1).
 */
export interface OccupancyInterval {
  start: number; // toUtcDay
  end: number; // toUtcDay, эксклюзивно
  weight: number;
}

/** Список «ночей» диапазона [checkIn, checkOut) как UTC-day ms. Пустой при некорректном диапазоне. */
export function rangeNights(checkIn: Date | string, checkOut: Date | string): number[] {
  const a = toUtcDay(checkIn);
  const b = toUtcDay(checkOut);
  const nights: number[] = [];
  for (let d = a; d < b; d += DAY_MS) nights.push(d);
  return nights;
}

/** Покрывает ли интервал конкретную ночь D (start ≤ D < end). */
function covers(iv: OccupancyInterval, day: number): boolean {
  return iv.start <= day && day < iv.end;
}

/**
 * Максимальная занятость (сумма weight пересекающих интервалов) по ночам диапазона.
 * Именно пиковая ночь ограничивает, сколько единиц свободно на весь непрерывный
 * период: available = totalSellable − maxNightlyOccupancy. Безопасно от овербукинга.
 */
export function maxNightlyOccupancy(nights: number[], intervals: OccupancyInterval[]): number {
  let max = 0;
  for (const day of nights) {
    let sum = 0;
    for (const iv of intervals) if (covers(iv, day)) sum += iv.weight;
    if (sum > max) max = sum;
  }
  return max;
}

/** Пересекаются ли два полуинтервала [aStart,aEnd) и [bStart,bEnd) (день конца не занимает ночь). */
export function rangesOverlap(aStart: Date | string, aEnd: Date | string, bStart: Date | string, bEnd: Date | string): boolean {
  return toUtcDay(aStart) < toUtcDay(bEnd) && toUtcDay(bStart) < toUtcDay(aEnd);
}
