/**
 * Воронка автоматизированного заселения (CHECK-IN-TZ.md §1).
 *
 * Вторая, ортогональная ось статусов: живёт ВНУТРИ BookingStatus.CONFIRMED и
 * кульминирует в существующем переходе CONFIRMED → CHECKED_IN. Ось шахматки
 * (BookingStatus) не расширяет и не подменяет. Стадия — производная от шлюзов
 * (денормализованный кэш на брони), истина — сами шлюзы.
 */
import { BookingStatus, CheckinStatus } from '../enums.js';
import type { KeyValidityWindow } from './key.js';

/** Стадия воронки заселения (CHECK-IN-TZ.md §1). */
export enum FunnelStage {
  /** Бронь создана, гость ещё не в воронке (нет верифицированного контакта). */
  AWAITING = 'AWAITING',
  /** Есть верифицированный контакт, гость привязан к брони. */
  IDENTIFIED = 'IDENTIFIED',
  /** Онлайн-регистрация подтверждена (Checkin.APPROVED). */
  REGISTERED = 'REGISTERED',
  /** Оплата/депозит выполнены (если требуются). */
  PAID = 'PAID',
  /** Все шлюзы зелёные, окно наступило — можно выдавать ключ. */
  READY = 'READY',
  /** Ключ(и) созданы в TTLock. */
  KEY_ISSUED = 'KEY_ISSUED',
  /** Гость заселён/выехал — воронка завершена (ось шахматки). */
  COMPLETED = 'COMPLETED',
  /** Терминальные — по оси шахматки. */
  NO_SHOW = 'NO_SHOW',
  CANCELLED = 'CANCELLED',
}

/** Машинные ключи шлюзов (совпадают со словарём условий конструктора воронки, §2.1). */
export type FunnelGateKey =
  | 'contact_verified'
  | 'registration_approved'
  | 'payment_paid'
  | 'room_assigned'
  | 'time_window_open';

/**
 * Словарь предопределённых условий-шлюзов конструктора воронки (§2.1).
 * Условия выбираются из этого списка, произвольный код не допускается.
 */
export const FUNNEL_CONDITIONS = [
  { type: 'contact_verified', label: 'Верифицированный контакт гостя' },
  { type: 'registration_approved', label: 'Онлайн-регистрация подтверждена' },
  { type: 'consents_signed', label: 'Согласия подписаны' },
  { type: 'passport_valid', label: 'Паспорт прошёл авто-проверку' },
  { type: 'payment_paid', label: 'Оплата выполнена' },
  { type: 'deposit_held', label: 'Депозит захолдирован' },
  { type: 'room_assigned', label: 'Конкретный номер назначен' },
  { type: 'time_window_open', label: 'Наступило окно выдачи ключа' },
  { type: 'manual_admin_ok', label: 'Ручное подтверждение сотрудником' },
] as const;
export type FunnelConditionType = (typeof FUNNEL_CONDITIONS)[number]['type'];

/** Каналы коммуникации этапа (§5.1). Показываются только фактически подключённые. */
export const FUNNEL_CHANNELS = [
  { key: 'push', label: 'Push (приложение)' },
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Email' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'ota_messaging', label: 'Сообщение внутри OTA' },
  { key: 'guest_portal', label: 'Гостевой портал (magic-link)' },
] as const;
export type FunnelChannelKey = (typeof FUNNEL_CHANNELS)[number]['key'];

/** Типовые этапы воронки (§2.1). custom — произвольный информационный этап. */
export const FUNNEL_STAGE_KEYS = [
  { key: 'identification', label: 'Идентификация гостя' },
  { key: 'registration', label: 'Онлайн-регистрация' },
  { key: 'payment', label: 'Оплата/депозит' },
  { key: 'key_issue', label: 'Готовность и ключ' },
  { key: 'custom', label: 'Свой этап' },
] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGE_KEYS)[number]['key'];

/**
 * Защищённые этапы (§2.3): выключить/сделать необязательными можно только с
 * явным подтверждением (force); key_issue выключить нельзя вовсе.
 */
export const FUNNEL_PROTECTED_STAGE_KEYS: FunnelStageKey[] = ['registration', 'payment'];

/** Состояние одного шлюза для панели «Заселение». */
export interface FunnelGate {
  key: FunnelGateKey;
  /** Зелёный ли шлюз. */
  ok: boolean;
  /** Причина, если красный (для гостя/сотрудника). Пусто, если ok. */
  reason: string | null;
}

/** Входные факты для вычисления стадии — читаются из существующих полей. */
export interface FunnelContext {
  bookingStatus: BookingStatus;
  /** Checkin.status (NOT_STARTED, если регистрация не начата). */
  checkinStatus: CheckinStatus;
  /** Есть верифицированный контакт (телефон/email) и гость привязан к брони. */
  hasVerifiedContact: boolean;
  /** Оплата/депозит выполнены (paymentStatus PAID / депозит захолдирован). */
  paymentSatisfied: boolean;
  /** Требуются ли оплата/депозит правилами объекта. */
  paymentRequired: boolean;
  /** Назначен ли конкретный номер (Booking.roomId != null). */
  roomAssigned: boolean;
  /** Есть ли активный цифровой ключ (DigitalKey ACTIVE). */
  hasActiveKey: boolean;
  now: Date;
  /** Окно действия ключа (computeKeyValidityWindow). */
  window: KeyValidityWindow;
}

export interface FunnelView {
  stage: FunnelStage;
  gates: FunnelGate[];
}

/** Все шлюзы с текущим состоянием (для цветовой индикации в UI). */
export function computeFunnelGates(ctx: FunnelContext): FunnelGate[] {
  const gate = (key: FunnelGateKey, ok: boolean, reason: string): FunnelGate => ({
    key,
    ok,
    reason: ok ? null : reason,
  });
  const windowOpen = ctx.now >= ctx.window.start && ctx.now <= ctx.window.end;
  return [
    gate('contact_verified', ctx.hasVerifiedContact, 'Нет верифицированного контакта гостя'),
    gate(
      'registration_approved',
      ctx.checkinStatus === CheckinStatus.APPROVED,
      'Онлайн-регистрация не подтверждена',
    ),
    gate(
      'payment_paid',
      !ctx.paymentRequired || ctx.paymentSatisfied,
      'Оплата/депозит не выполнены',
    ),
    gate('room_assigned', ctx.roomAssigned, 'Конкретный номер не назначен'),
    gate(
      'time_window_open',
      windowOpen,
      ctx.now < ctx.window.start ? 'Не наступило время выдачи ключа' : 'Окно действия ключа истекло',
    ),
  ];
}

/**
 * Вычислить стадию воронки из шлюзов. Стадия — строго последовательная:
 * невыполненный ранний шлюз останавливает продвижение, даже если поздние зелёные
 * (напр. оплачено, но регистрация не пройдена → IDENTIFIED).
 */
export function computeFunnelStage(ctx: FunnelContext): FunnelView {
  const gates = computeFunnelGates(ctx);
  const ok = (key: FunnelGateKey): boolean => gates.find((g) => g.key === key)?.ok ?? false;

  // Терминальные и завершение — по оси шахматки.
  if (ctx.bookingStatus === BookingStatus.CANCELLED) return { stage: FunnelStage.CANCELLED, gates };
  if (ctx.bookingStatus === BookingStatus.NO_SHOW) return { stage: FunnelStage.NO_SHOW, gates };
  if (
    ctx.bookingStatus === BookingStatus.CHECKED_IN ||
    ctx.bookingStatus === BookingStatus.CHECKED_OUT
  ) {
    return { stage: FunnelStage.COMPLETED, gates };
  }

  let stage = FunnelStage.AWAITING;
  if (ok('contact_verified')) stage = FunnelStage.IDENTIFIED;
  else return { stage, gates };

  if (ok('registration_approved')) stage = FunnelStage.REGISTERED;
  else return { stage, gates };

  if (ok('payment_paid')) stage = FunnelStage.PAID;
  else return { stage, gates };

  // READY — только у подтверждённой брони с назначенным номером в открытом окне.
  if (ctx.bookingStatus === BookingStatus.CONFIRMED && ok('room_assigned') && ok('time_window_open')) {
    stage = FunnelStage.READY;
  } else return { stage, gates };

  if (ctx.hasActiveKey) stage = FunnelStage.KEY_ISSUED;
  return { stage, gates };
}
