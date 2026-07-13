/**
 * Правила раздела «Мои бронирования» (§7 ТЗ): распределение брони по 4 разделам.
 */
import { BookingSection, BookingStatus } from '../enums.js';

export interface BookingDates {
  status: BookingStatus;
  checkinAt: Date;
  checkoutAt: Date;
}

/**
 * Вычислить раздел бронирования (§7):
 *  - отменённые — статус CANCELLED;
 *  - текущие — заезд наступил, выезд ещё нет, не отменено;
 *  - предстоящие — дата заезда в будущем;
 *  - прошлые — проживание завершено (выезд прошёл / статус завершён).
 */
export function classifyBookingSection(booking: BookingDates, now: Date = new Date()): BookingSection {
  if (booking.status === BookingStatus.CANCELLED) {
    return BookingSection.CANCELLED;
  }
  if (booking.status === BookingStatus.CHECKED_OUT || now >= booking.checkoutAt) {
    return BookingSection.PAST;
  }
  if (now >= booking.checkinAt && now < booking.checkoutAt) {
    return BookingSection.CURRENT;
  }
  return BookingSection.UPCOMING;
}
