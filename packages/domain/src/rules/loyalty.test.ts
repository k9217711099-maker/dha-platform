import { describe, expect, it } from 'vitest';
import { BookingChannel, LoyaltyTier } from '../enums.js';
import {
  calcAccrualPoints,
  canRedeem,
  determineTier,
  isDirectChannel,
  maxRedeemablePoints,
  MIN_REDEMPTION_POINTS,
  pointsExpiryDate,
  POINTS_EXPIRY_MONTHS,
  tierProgress,
} from './loyalty.js';

describe('начисление баллов (примеры из §13.4)', () => {
  it('Member 3% от 20 000 ₽ = 600', () => {
    expect(
      calcAccrualPoints({
        eligibleStayCostRub: 20_000,
        tier: LoyaltyTier.MEMBER,
        channel: BookingChannel.WEBSITE,
      }),
    ).toBe(600);
  });

  it('Silver 5% = 1000, Gold 7% = 1400, Platinum 10% = 2000', () => {
    const base = { eligibleStayCostRub: 20_000, channel: BookingChannel.MOBILE_APP };
    expect(calcAccrualPoints({ ...base, tier: LoyaltyTier.SILVER })).toBe(1000);
    expect(calcAccrualPoints({ ...base, tier: LoyaltyTier.GOLD })).toBe(1400);
    expect(calcAccrualPoints({ ...base, tier: LoyaltyTier.PLATINUM })).toBe(2000);
  });

  it('за OTA-бронирования баллы не начисляются (§13.3)', () => {
    expect(
      calcAccrualPoints({
        eligibleStayCostRub: 20_000,
        tier: LoyaltyTier.GOLD,
        channel: BookingChannel.OTA,
      }),
    ).toBe(0);
    expect(isDirectChannel(BookingChannel.OTA)).toBe(false);
    expect(isDirectChannel(BookingChannel.WEBSITE)).toBe(true);
  });
});

describe('определение уровня (§13.4)', () => {
  it('по сумме прямых бронирований за 12 мес', () => {
    expect(determineTier(0, 0)).toBe(LoyaltyTier.MEMBER);
    expect(determineTier(50_000, 0)).toBe(LoyaltyTier.SILVER);
    expect(determineTier(150_000, 0)).toBe(LoyaltyTier.GOLD);
    expect(determineTier(300_000, 0)).toBe(LoyaltyTier.PLATINUM);
  });

  it('по числу ночей (порог ИЛИ-ИЛИ)', () => {
    expect(determineTier(0, 5)).toBe(LoyaltyTier.SILVER);
    expect(determineTier(0, 15)).toBe(LoyaltyTier.GOLD);
    expect(determineTier(0, 30)).toBe(LoyaltyTier.PLATINUM);
  });
});

describe('списание баллов (§13.5)', () => {
  it('Silver: не более 15% стоимости брони', () => {
    // 15% от 20 000 ₽ = 3000 баллов
    expect(
      maxRedeemablePoints({ availablePoints: 10_000, totalBookingRub: 20_000, tier: LoyaltyTier.SILVER }),
    ).toBe(3000);
  });

  it('ограничено числом доступных баллов', () => {
    expect(
      maxRedeemablePoints({ availablePoints: 1000, totalBookingRub: 20_000, tier: LoyaltyTier.SILVER }),
    ).toBe(1000);
  });

  it('меньше минимума (500) — списание недоступно', () => {
    expect(
      maxRedeemablePoints({ availablePoints: 400, totalBookingRub: 20_000, tier: LoyaltyTier.MEMBER }),
    ).toBe(0);
    expect(
      canRedeem({
        pointsToRedeem: MIN_REDEMPTION_POINTS - 1,
        availablePoints: 10_000,
        totalBookingRub: 20_000,
        tier: LoyaltyTier.SILVER,
      }),
    ).toBe(false);
  });

  it('нельзя списать больше доли уровня', () => {
    expect(
      canRedeem({
        pointsToRedeem: 4000, // > 15% от 20000
        availablePoints: 10_000,
        totalBookingRub: 20_000,
        tier: LoyaltyTier.SILVER,
      }),
    ).toBe(false);
  });
});

describe('прогресс до следующего уровня (§13.4)', () => {
  it('Member → Silver: сколько не хватает', () => {
    const p = tierProgress(20_000, 2);
    expect(p.current).toBe(LoyaltyTier.MEMBER);
    expect(p.next).toBe(LoyaltyTier.SILVER);
    expect(p.amountToNext).toBe(30_000); // 50000 - 20000
    expect(p.nightsToNext).toBe(3); // 5 - 2
  });

  it('Platinum — максимум, следующего нет', () => {
    const p = tierProgress(300_000, 0);
    expect(p.current).toBe(LoyaltyTier.PLATINUM);
    expect(p.next).toBeNull();
  });
});

describe('срок действия баллов (§13.6)', () => {
  it('24 месяца с даты начисления', () => {
    const accruedAt = new Date('2026-01-15T00:00:00Z');
    const expiry = pointsExpiryDate(accruedAt);
    expect(expiry.getUTCFullYear()).toBe(2028);
    expect(POINTS_EXPIRY_MONTHS).toBe(24);
  });
});
