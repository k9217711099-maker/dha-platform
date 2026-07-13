/** Собрать дату+время заезда/выезда из даты брони и времени объекта ('HH:MM'). */
export function combineDateAndTime(date: Date, time: string | null, fallback: string): Date {
  const parts = (time ?? fallback).split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(date);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}
