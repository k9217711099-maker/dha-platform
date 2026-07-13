import type { ExtraUnit } from './api-types';

/** Стоимость позиции доп-услуги (зеркало backend computeExtraTotal). */
export function computeExtraTotal(unit: ExtraUnit, price: number, qty: number, nights: number, guests: number): number {
  const n = Math.max(nights, 1);
  const g = Math.max(guests, 1);
  switch (unit) {
    case 'PER_NIGHT':
      return price * qty * n;
    case 'PER_PERSON':
      return price * qty * g;
    case 'PER_PERSON_NIGHT':
      return price * qty * g * n;
    case 'PER_STAY':
    default:
      return price * qty;
  }
}

export const UNIT_LABEL: Record<ExtraUnit, string> = {
  PER_STAY: 'за проживание',
  PER_NIGHT: 'за ночь',
  PER_PERSON: 'за гостя',
  PER_PERSON_NIGHT: 'за гостя/ночь',
};

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(Math.round(ms / 86_400_000), 1);
}
