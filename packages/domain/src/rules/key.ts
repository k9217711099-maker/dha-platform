/**
 * Бизнес-правила цифрового ключа TTLock (§9 ТЗ).
 * Чистые функции; фактическое создание/отзыв доступа — в integrations/ttlock.
 */
import { BookingStatus, CheckinStatus } from '../enums.js';

/** По умолчанию: начало действия — за 30 мин до заезда (§9.4). */
export const KEY_DEFAULT_PRE_CHECKIN_MINUTES = 30;

/** По умолчанию: окончание — через 30 мин после выезда (§9.4). */
export const KEY_DEFAULT_POST_CHECKOUT_MINUTES = 30;

export interface KeyValidityWindow {
  start: Date;
  end: Date;
}

/**
 * Рассчитать окно действия ключа. Смещения настраиваются в админ-панели,
 * по умолчанию −30 мин / +30 мин (§9.4).
 */
export function computeKeyValidityWindow(params: {
  checkinAt: Date;
  checkoutAt: Date;
  preCheckinMinutes?: number;
  postCheckoutMinutes?: number;
}): KeyValidityWindow {
  const pre = params.preCheckinMinutes ?? KEY_DEFAULT_PRE_CHECKIN_MINUTES;
  const post = params.postCheckoutMinutes ?? KEY_DEFAULT_POST_CHECKOUT_MINUTES;
  return {
    start: new Date(params.checkinAt.getTime() - pre * 60_000),
    end: new Date(params.checkoutAt.getTime() + post * 60_000),
  };
}

/** Условия выдачи ключа (§9.3). */
export interface KeyIssuanceContext {
  bookingStatus: BookingStatus;
  checkinStatus: CheckinStatus;
  /** Выполнены ли оплата/депозит, если требуются правилами объекта. */
  paymentSatisfied: boolean;
  /** Требуются ли оплата/депозит для этого объекта. */
  paymentRequired: boolean;
  /**
   * Требуется ли онлайн-регистрация (по умолчанию true). Конструктор воронки
   * (CHECK-IN-TZ §2) может выключить этап регистрации — тогда шлюз снимается.
   */
  registrationRequired?: boolean;
  /** Текущий момент. */
  now: Date;
  /** Окно действия ключа. */
  window: KeyValidityWindow;
}

export interface KeyIssuanceDecision {
  allowed: boolean;
  /** Причины отказа (пусто, если allowed). */
  reasons: string[];
}

/**
 * Можно ли выдавать ключ прямо сейчас (§9.3):
 * бронь активна и не отменена, наступило разрешённое время выдачи,
 * пройдена онлайн-регистрация, выполнены оплата/депозит (если требуются).
 */
export function canIssueKey(ctx: KeyIssuanceContext): KeyIssuanceDecision {
  const reasons: string[] = [];

  if (ctx.bookingStatus === BookingStatus.CANCELLED) {
    reasons.push('Бронирование отменено');
  }
  const activeStatuses: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
  if (!activeStatuses.includes(ctx.bookingStatus)) {
    reasons.push('Бронирование не в активном статусе');
  }
  if ((ctx.registrationRequired ?? true) && ctx.checkinStatus !== CheckinStatus.APPROVED) {
    reasons.push('Онлайн-регистрация не подтверждена');
  }
  if (ctx.paymentRequired && !ctx.paymentSatisfied) {
    reasons.push('Оплата/депозит не выполнены');
  }
  if (ctx.now < ctx.window.start) {
    reasons.push('Не наступило время выдачи ключа');
  }
  if (ctx.now > ctx.window.end) {
    reasons.push('Срок действия ключа истёк');
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * Нужно ли отозвать/удалить ключ: после окончания окна действия доступ
 * автоматически отзывается, цифровой пароль удаляется (§9.1, §9.4).
 */
export function shouldRevokeKey(now: Date, window: KeyValidityWindow): boolean {
  return now > window.end;
}
