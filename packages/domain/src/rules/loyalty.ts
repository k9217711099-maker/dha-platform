/**
 * Бизнес-правила программы лояльности (§13 ТЗ).
 * Чистые функции без побочных эффектов — покрываются юнит-тестами и
 * переиспользуются backend/web/mobile. Источник истины по лояльности — backend D H&A.
 */
import { BookingChannel, LoyaltyTier } from '../enums.js';

/** 1 балл = 1 рубль при списании (§13.2). */
export const POINT_TO_RUB = 1;

/** Минимальное списание за раз, баллов (§13.5). */
export const MIN_REDEMPTION_POINTS = 500;

/** Срок действия баллов с даты начисления, месяцев (§13.6). */
export const POINTS_EXPIRY_MONTHS = 24;

/** Окно расчёта порогов уровня — скользящие 12 месяцев (§13.4). */
export const TIER_QUALIFICATION_MONTHS = 12;

/** Конфигурация уровня лояльности. */
export interface TierConfig {
  tier: LoyaltyTier;
  /** Доля начисления от стоимости проживания (0.03 = 3%). */
  accrualRate: number;
  /** Порог по сумме оплаченных прямых бронирований за 12 мес, ₽ (для повышения). */
  thresholdAmountRub: number;
  /** Порог по числу ночей за 12 мес (для повышения). */
  thresholdNights: number;
  /**
   * Максимальная доля итоговой стоимости брони, оплачиваемая баллами.
   * ВНИМАНИЕ: в ТЗ явно задан только Silver — «до 15%» (§13.4). Остальные
   * значения — разумные дефолты, ТРЕБУЮТ ПОДТВЕРЖДЕНИЯ у владельца.
   */
  maxRedemptionShare: number;
}

/** Конфиг уровней (§13.4). Порядок — по возрастанию. */
export const LOYALTY_TIERS: readonly TierConfig[] = [
  {
    tier: LoyaltyTier.MEMBER,
    accrualRate: 0.03,
    thresholdAmountRub: 0,
    thresholdNights: 0,
    maxRedemptionShare: 0.15, // TODO: подтвердить (ТЗ не задаёт для Member)
  },
  {
    tier: LoyaltyTier.SILVER,
    accrualRate: 0.05,
    thresholdAmountRub: 50_000,
    thresholdNights: 5,
    maxRedemptionShare: 0.15, // §13.4 — «оплата баллами до 15%»
  },
  {
    tier: LoyaltyTier.GOLD,
    accrualRate: 0.07,
    thresholdAmountRub: 150_000,
    thresholdNights: 15,
    maxRedemptionShare: 0.2, // TODO: подтвердить
  },
  {
    tier: LoyaltyTier.PLATINUM,
    accrualRate: 0.1,
    thresholdAmountRub: 300_000,
    thresholdNights: 30,
    maxRedemptionShare: 0.3, // TODO: подтвердить
  },
] as const;

export function getTierConfig(tier: LoyaltyTier): TierConfig {
  const cfg = LOYALTY_TIERS.find((t) => t.tier === tier);
  if (!cfg) throw new Error(`Неизвестный уровень лояльности: ${tier}`);
  return cfg;
}

/** Прямой ли канал бронирования (баллы начисляются только за прямые, §13.3). */
export function isDirectChannel(channel: BookingChannel): boolean {
  return channel !== BookingChannel.OTA;
}

/**
 * Определить уровень по квалифицирующим показателям за 12 мес.
 * Уровень присваивается, если выполнен порог ПО СУММЕ ИЛИ ПО НОЧАМ (§13.4).
 */
export function determineTier(qualifyingAmountRub: number, qualifyingNights: number): LoyaltyTier {
  let result = LoyaltyTier.MEMBER;
  for (const cfg of LOYALTY_TIERS) {
    if (qualifyingAmountRub >= cfg.thresholdAmountRub || qualifyingNights >= cfg.thresholdNights) {
      result = cfg.tier;
    }
  }
  return result;
}

/**
 * Рассчитать начисление баллов за проживание.
 * База — стоимость проживания без налогов/депозитов/штрафов/возвратов/услуг
 * партнёров/отменённых услуг (§13.3). Начисляется только за прямые брони.
 * Округление вниз.
 */
export function calcAccrualPoints(params: {
  /** Очищенная база начисления (стоимость проживания), ₽. */
  eligibleStayCostRub: number;
  tier: LoyaltyTier;
  channel: BookingChannel;
}): number {
  if (!isDirectChannel(params.channel)) return 0;
  if (params.eligibleStayCostRub <= 0) return 0;
  const { accrualRate } = getTierConfig(params.tier);
  return Math.floor(params.eligibleStayCostRub * accrualRate);
}

/**
 * Максимально допустимое списание баллов к конкретной брони.
 * Ограничено долей итоговой стоимости (по уровню) и числом доступных баллов;
 * результат не учитывается, если меньше минимального списания.
 */
export function maxRedeemablePoints(params: {
  availablePoints: number;
  totalBookingRub: number;
  tier: LoyaltyTier;
}): number {
  const { maxRedemptionShare } = getTierConfig(params.tier);
  const capByShare = Math.floor((params.totalBookingRub * maxRedemptionShare) / POINT_TO_RUB);
  const redeemable = Math.min(params.availablePoints, capByShare);
  return redeemable >= MIN_REDEMPTION_POINTS ? redeemable : 0;
}

/** Можно ли списать указанное число баллов к брони. */
export function canRedeem(params: {
  pointsToRedeem: number;
  availablePoints: number;
  totalBookingRub: number;
  tier: LoyaltyTier;
}): boolean {
  if (params.pointsToRedeem < MIN_REDEMPTION_POINTS) return false;
  if (params.pointsToRedeem > params.availablePoints) return false;
  return params.pointsToRedeem <= maxRedeemablePoints(params);
}

export interface TierProgress {
  current: LoyaltyTier;
  /** Следующий уровень или null, если достигнут максимум. */
  next: LoyaltyTier | null;
  /** Сколько ₽ прямых бронирований не хватает до следующего уровня. */
  amountToNext: number;
  /** Сколько ночей не хватает до следующего уровня. */
  nightsToNext: number;
}

/**
 * Прогресс до следующего уровня по квалифицирующим показателям за 12 мес.
 * Достаточно выполнить порог по сумме ИЛИ по ночам (§13.4).
 */
export function tierProgress(qualifyingAmountRub: number, qualifyingNights: number): TierProgress {
  const current = determineTier(qualifyingAmountRub, qualifyingNights);
  const currentIndex = LOYALTY_TIERS.findIndex((t) => t.tier === current);
  const nextCfg = LOYALTY_TIERS[currentIndex + 1];
  if (!nextCfg) {
    return { current, next: null, amountToNext: 0, nightsToNext: 0 };
  }
  return {
    current,
    next: nextCfg.tier,
    amountToNext: Math.max(0, nextCfg.thresholdAmountRub - qualifyingAmountRub),
    nightsToNext: Math.max(0, nextCfg.thresholdNights - qualifyingNights),
  };
}

/** Дата сгорания партии баллов (§13.6). */
export function pointsExpiryDate(accruedAt: Date): Date {
  const d = new Date(accruedAt);
  d.setMonth(d.getMonth() + POINTS_EXPIRY_MONTHS);
  return d;
}

/**
 * Новый срок действия всех активных баллов при новом прямом бронировании:
 * продление ещё на 24 месяца от даты события (§13.6).
 */
export function extendedExpiryDate(directBookingAt: Date): Date {
  return pointsExpiryDate(directBookingAt);
}
