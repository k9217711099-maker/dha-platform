import { describe, expect, it } from 'vitest';
import { BookingStatus, CheckinStatus } from '../enums.js';
import { canIssueKey, computeKeyValidityWindow, shouldRevokeKey } from './key.js';

const checkinAt = new Date('2026-07-01T14:00:00Z');
const checkoutAt = new Date('2026-07-03T12:00:00Z');
const window = computeKeyValidityWindow({ checkinAt, checkoutAt });

describe('окно действия ключа (§9.4)', () => {
  it('начало за 30 мин до заезда, окончание через 30 мин после выезда', () => {
    expect(window.start.toISOString()).toBe('2026-07-01T13:30:00.000Z');
    expect(window.end.toISOString()).toBe('2026-07-03T12:30:00.000Z');
  });
});

describe('условия выдачи ключа (§9.3)', () => {
  const okCtx = {
    bookingStatus: BookingStatus.CONFIRMED,
    checkinStatus: CheckinStatus.APPROVED,
    paymentSatisfied: true,
    paymentRequired: true,
    now: new Date('2026-07-01T13:35:00Z'),
    window,
  };

  it('выдаёт ключ при выполнении всех условий', () => {
    expect(canIssueKey(okCtx).allowed).toBe(true);
  });

  it('не выдаёт при отменённой брони', () => {
    const d = canIssueKey({ ...okCtx, bookingStatus: BookingStatus.CANCELLED });
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain('Бронирование отменено');
  });

  it('не выдаёт без подтверждённой онлайн-регистрации', () => {
    const d = canIssueKey({ ...okCtx, checkinStatus: CheckinStatus.SUBMITTED });
    expect(d.allowed).toBe(false);
  });

  it('регистрация выключена конструктором воронки — шлюз снимается (CHECK-IN-TZ §2)', () => {
    const d = canIssueKey({ ...okCtx, checkinStatus: CheckinStatus.NOT_STARTED, registrationRequired: false });
    expect(d.allowed).toBe(true);
  });

  it('не выдаёт при невыполненной оплате, если она требуется', () => {
    const d = canIssueKey({ ...okCtx, paymentSatisfied: false });
    expect(d.allowed).toBe(false);
  });

  it('не выдаёт до наступления времени выдачи', () => {
    const d = canIssueKey({ ...okCtx, now: new Date('2026-07-01T10:00:00Z') });
    expect(d.allowed).toBe(false);
  });
});

describe('авто-отзыв ключа (§9.4)', () => {
  it('отзывается после окончания окна действия', () => {
    expect(shouldRevokeKey(new Date('2026-07-03T13:00:00Z'), window)).toBe(true);
    expect(shouldRevokeKey(new Date('2026-07-02T13:00:00Z'), window)).toBe(false);
  });
});
