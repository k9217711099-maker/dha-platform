/** Производные показатели аналитики (§19). Чистые функции, без зависимостей. */

export interface KpiInputs {
  bookings: number;
  directBookings: number;
  paidCount: number;
  paidSumRub: number;
  registrations: number;
  /** Уникальных гостей, сделавших хотя бы одну бронь. */
  guestsWithBooking: number;
  /** Уникальных гостей с двумя и более бронями. */
  guestsWithRepeat: number;
}

export interface DerivedKpis {
  /** Доля прямых бронирований (0..1). */
  directShare: number;
  /** Средний чек по оплаченным броням, ₽. */
  averageCheckRub: number;
  /** Конверсия регистрации → бронирование (0..1). */
  conversionRate: number;
  /** Доля повторных гостей (0..1). */
  repeatRate: number;
}

const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

export function computeDerivedKpis(i: KpiInputs): DerivedKpis {
  return {
    directShare: ratio(i.directBookings, i.bookings),
    averageCheckRub: i.paidCount > 0 ? Math.round(i.paidSumRub / i.paidCount) : 0,
    conversionRate: ratio(i.guestsWithBooking, i.registrations),
    repeatRate: ratio(i.guestsWithRepeat, i.guestsWithBooking),
  };
}
