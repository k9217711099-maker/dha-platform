import type { PmsBooking } from '../../../lib/api';

/** Статусы как в Bnovo: Новое / Проверено / Заселён / Выехал / Неявка / Отменён + цвета. */
export const STATUS_META: Record<string, { label: string; stripe: string; border: string; bg: string; badge: string }> = {
  PENDING: { label: 'Новое', stripe: 'bg-emerald-500', border: 'border-emerald-500', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-800' },
  CONFIRMED: { label: 'Проверено', stripe: 'bg-amber-400', border: 'border-amber-400', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800' },
  CHECKED_IN: { label: 'Заселён', stripe: 'bg-sky-500', border: 'border-sky-500', bg: 'bg-sky-50', badge: 'bg-sky-100 text-sky-800' },
  CHECKED_OUT: { label: 'Выехал', stripe: 'bg-ink/40', border: 'border-ink/40', bg: 'bg-ink/5', badge: 'bg-ink/10 text-ink' },
  NO_SHOW: { label: 'Неявка', stripe: 'bg-rose-400', border: 'border-rose-400', bg: 'bg-rose-50', badge: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Отменён', stripe: 'bg-ink/30', border: 'border-ink/30', bg: 'bg-ink/5', badge: 'bg-ink/10 text-ink' },
};
export const statusMeta = (s: string) => STATUS_META[s] ?? STATUS_META.PENDING!;

export const guestName = (b: PmsBooking) => `${b.guest?.lastName ?? ''} ${b.guest?.firstName ?? ''}`.trim() || 'Гость';
export const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Оценка «оплачено»: суммы платежей в списке нет, берём по статусу оплаты (PAID → полностью, иначе 0). */
export function paidAmount(b: PmsBooking): number {
  return b.paymentStatus === 'PAID' ? b.totalPrice : 0;
}

/**
 * Бейдж баланса в углу брони:
 * — зелёный = предоплата, покрывающая ещё НЕ прожитые (будущие) ночи;
 * — красный = долг за уже ПРОЖИТЫЕ (прошедшие) ночи.
 * Ночь на дату D считается прошедшей, если D < сегодня.
 */
export function balanceBadge(b: PmsBooking, todayIso: string): { amount: number; kind: 'green' | 'red' } | null {
  if (b.status === 'CANCELLED') return null;
  const total = b.totalPrice;
  let past = 0;
  const nights = b.priceBreakdown?.nights;
  if (nights && nights.length) {
    for (const n of nights) if (n.date.slice(0, 10) < todayIso) past += n.finalPrice;
  } else {
    const N = Math.max(1, b.nights);
    const per = total / N;
    const ci = b.checkIn.slice(0, 10);
    for (let i = 0; i < N; i++) if (addDays(ci, i) < todayIso) past += per;
  }
  const paid = paidAmount(b);
  const prepaidFuture = Math.max(0, paid - past);
  const unpaidPast = Math.max(0, Math.min(past, total) - paid);
  if (prepaidFuture > 0.5) return { amount: prepaidFuture, kind: 'green' };
  if (unpaidPast > 0.5) return { amount: unpaidPast, kind: 'red' };
  return null;
}

/** Доля суток (0..1) по времени HH:mm — для контуров брони с учётом времени заезда/выезда. */
export function timeFrac(hhmm: string | null, fallback: number): number {
  if (!hhmm) return fallback;
  const [h, m] = hhmm.split(':').map(Number);
  if (h == null || Number.isNaN(h)) return fallback;
  return Math.min(1, Math.max(0, (h + (m ?? 0) / 60) / 24));
}
