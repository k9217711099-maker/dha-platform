import { describe, expect, it } from 'vitest';
import { BookingSection, BookingStatus } from '../enums.js';
import { classifyBookingSection } from './booking.js';

const now = new Date('2026-07-02T10:00:00Z');

describe('распределение бронирований по разделам (§7)', () => {
  it('отменённые — раздел CANCELLED независимо от дат', () => {
    expect(
      classifyBookingSection(
        {
          status: BookingStatus.CANCELLED,
          checkinAt: new Date('2026-07-10T14:00:00Z'),
          checkoutAt: new Date('2026-07-12T12:00:00Z'),
        },
        now,
      ),
    ).toBe(BookingSection.CANCELLED);
  });

  it('текущие — заезд наступил, выезд ещё нет', () => {
    expect(
      classifyBookingSection(
        {
          status: BookingStatus.CHECKED_IN,
          checkinAt: new Date('2026-07-01T14:00:00Z'),
          checkoutAt: new Date('2026-07-03T12:00:00Z'),
        },
        now,
      ),
    ).toBe(BookingSection.CURRENT);
  });

  it('предстоящие — заезд в будущем', () => {
    expect(
      classifyBookingSection(
        {
          status: BookingStatus.CONFIRMED,
          checkinAt: new Date('2026-07-10T14:00:00Z'),
          checkoutAt: new Date('2026-07-12T12:00:00Z'),
        },
        now,
      ),
    ).toBe(BookingSection.UPCOMING);
  });

  it('прошлые — проживание завершено', () => {
    expect(
      classifyBookingSection(
        {
          status: BookingStatus.CHECKED_OUT,
          checkinAt: new Date('2026-06-20T14:00:00Z'),
          checkoutAt: new Date('2026-06-22T12:00:00Z'),
        },
        now,
      ),
    ).toBe(BookingSection.PAST);
  });
});
