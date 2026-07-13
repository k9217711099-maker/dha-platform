import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * Число ночей между заездом и выездом. **Дата выезда ночь не занимает** (DHP ADR-005):
 * 2026-08-01 → 2026-08-05 = 4 ночи. Бросает 400 при некорректном диапазоне.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${checkOut.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    throw new BadRequestException('Некорректные даты заезда/выезда');
  }
  const nights = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (nights <= 0) throw new BadRequestException('Дата выезда должна быть позже даты заезда');
  return nights;
}

/** Человекочитаемый номер брони: DHA-YYYYMMDD-XXXXXX (энтропии достаточно, @unique — страховка). */
export function generateBookingNumber(now: Date = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `DHA-${ymd}-${rand}`;
}

/** Проверка допустимости перехода статуса брони (state machine). */
export function assertTransition(current: string, allowedFrom: string[], action: string): void {
  if (!allowedFrom.includes(current)) {
    throw new BadRequestException(`Действие «${action}» недоступно для брони в статусе ${current}`);
  }
}
