import { describe, expect, it } from 'vitest';
import { BookingStatus, CheckinStatus } from '../enums.js';
import { computeKeyValidityWindow } from './key.js';
import { computeFunnelStage, FunnelStage, type FunnelContext } from './checkin-funnel.js';

const window = computeKeyValidityWindow({
  checkinAt: new Date('2026-07-01T14:00:00Z'),
  checkoutAt: new Date('2026-07-03T12:00:00Z'),
});

/** Полностью зелёный контекст (в открытом окне). */
const okCtx: FunnelContext = {
  bookingStatus: BookingStatus.CONFIRMED,
  checkinStatus: CheckinStatus.APPROVED,
  hasVerifiedContact: true,
  paymentSatisfied: true,
  paymentRequired: true,
  roomAssigned: true,
  hasActiveKey: false,
  now: new Date('2026-07-01T13:35:00Z'),
  window,
};

describe('стадия воронки заселения (CHECK-IN-TZ §1)', () => {
  it('без контакта — AWAITING (типичный свежий импорт OTA)', () => {
    const v = computeFunnelStage({ ...okCtx, hasVerifiedContact: false, checkinStatus: CheckinStatus.NOT_STARTED, paymentSatisfied: false });
    expect(v.stage).toBe(FunnelStage.AWAITING);
    expect(v.gates.find((g) => g.key === 'contact_verified')?.ok).toBe(false);
  });

  it('контакт есть, регистрация не подтверждена — IDENTIFIED', () => {
    expect(computeFunnelStage({ ...okCtx, checkinStatus: CheckinStatus.SUBMITTED }).stage).toBe(FunnelStage.IDENTIFIED);
  });

  it('строго последовательная: оплачено, но регистрация не пройдена — всё ещё IDENTIFIED', () => {
    const v = computeFunnelStage({ ...okCtx, checkinStatus: CheckinStatus.DRAFT });
    expect(v.stage).toBe(FunnelStage.IDENTIFIED);
    expect(v.gates.find((g) => g.key === 'payment_paid')?.ok).toBe(true);
  });

  it('регистрация подтверждена, не оплачено — REGISTERED', () => {
    expect(computeFunnelStage({ ...okCtx, paymentSatisfied: false }).stage).toBe(FunnelStage.REGISTERED);
  });

  it('оплата не требуется объектом — шлюз оплаты зелёный', () => {
    const v = computeFunnelStage({ ...okCtx, paymentSatisfied: false, paymentRequired: false, now: new Date('2026-07-01T10:00:00Z') });
    expect(v.stage).toBe(FunnelStage.PAID);
  });

  it('всё готово, но окно не наступило — PAID', () => {
    expect(computeFunnelStage({ ...okCtx, now: new Date('2026-07-01T10:00:00Z') }).stage).toBe(FunnelStage.PAID);
  });

  it('всё готово, но номер не назначен — PAID', () => {
    expect(computeFunnelStage({ ...okCtx, roomAssigned: false }).stage).toBe(FunnelStage.PAID);
  });

  it('все шлюзы зелёные в окне — READY', () => {
    expect(computeFunnelStage(okCtx).stage).toBe(FunnelStage.READY);
  });

  it('ключ выдан — KEY_ISSUED', () => {
    expect(computeFunnelStage({ ...okCtx, hasActiveKey: true }).stage).toBe(FunnelStage.KEY_ISSUED);
  });

  it('согласованность с canIssueKey: READY ⇔ шлюзы регистрации/оплаты/окна зелёные', () => {
    const v = computeFunnelStage(okCtx);
    expect(v.gates.filter((g) => !g.ok)).toHaveLength(0);
  });

  it('терминальные по оси шахматки: CANCELLED / NO_SHOW / заселён', () => {
    expect(computeFunnelStage({ ...okCtx, bookingStatus: BookingStatus.CANCELLED }).stage).toBe(FunnelStage.CANCELLED);
    expect(computeFunnelStage({ ...okCtx, bookingStatus: BookingStatus.NO_SHOW }).stage).toBe(FunnelStage.NO_SHOW);
    expect(computeFunnelStage({ ...okCtx, bookingStatus: BookingStatus.CHECKED_IN }).stage).toBe(FunnelStage.COMPLETED);
    expect(computeFunnelStage({ ...okCtx, bookingStatus: BookingStatus.CHECKED_OUT }).stage).toBe(FunnelStage.COMPLETED);
  });

  it('PENDING-бронь не бывает READY (ось шахматки первична)', () => {
    expect(computeFunnelStage({ ...okCtx, bookingStatus: BookingStatus.PENDING }).stage).toBe(FunnelStage.PAID);
  });
});
