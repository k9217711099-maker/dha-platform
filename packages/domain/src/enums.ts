/**
 * Доменные перечисления платформы D H&A.
 * Строковые enum — удобно мапятся на Prisma-enum, DTO и хранилище.
 */

/** Статус бронирования (наш внутренний; синхронизируется с Bnovo). */
export enum BookingStatus {
  /** Создано на нашей стороне, ещё не подтверждено/не оплачено. */
  PENDING = 'PENDING',
  /** Подтверждено (есть в Bnovo). */
  CONFIRMED = 'CONFIRMED',
  /** Гость заехал. */
  CHECKED_IN = 'CHECKED_IN',
  /** Гость выехал (проживание завершено). */
  CHECKED_OUT = 'CHECKED_OUT',
  /** Не заехал. */
  NO_SHOW = 'NO_SHOW',
  /** Отменено. */
  CANCELLED = 'CANCELLED',
}

/** Раздел в «Мои бронирования» (§7 ТЗ) — вычисляется из дат и статуса. */
export enum BookingSection {
  /** Текущие: заезд наступил, выезд ещё нет, не отменено. */
  CURRENT = 'CURRENT',
  /** Предстоящие: дата заезда в будущем. */
  UPCOMING = 'UPCOMING',
  /** Прошлые: проживание завершено. */
  PAST = 'PAST',
  /** Отменённые. */
  CANCELLED = 'CANCELLED',
}

/** Канал бронирования. Прямые каналы — всё, кроме OTA (§13.3). */
export enum BookingChannel {
  WEBSITE = 'WEBSITE',
  MOBILE_APP = 'MOBILE_APP',
  PHONE = 'PHONE',
  MESSENGER = 'MESSENGER',
  MANAGER = 'MANAGER',
  /** Внешние агрегаторы (Booking, Avito и т.п.) — баллы не начисляются. */
  OTA = 'OTA',
}

/** Статус оплаты бронирования. */
export enum PaymentStatus {
  NOT_PAID = 'NOT_PAID',
  /** Платёж инициирован, ждём подтверждения. */
  PENDING = 'PENDING',
  /** Средства захолдированы (двухстадийный платёж / депозит). */
  AUTHORIZED = 'AUTHORIZED',
  PAID = 'PAID',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

/** Статус операции с баллами (§13.7). */
export enum PointStatus {
  /** Ожидают начисления (бронь создана, но проживание не завершено). */
  PENDING = 'PENDING',
  /** Доступны к списанию. */
  AVAILABLE = 'AVAILABLE',
  /** Списаны. */
  SPENT = 'SPENT',
  /** Заморожены. */
  FROZEN = 'FROZEN',
  /** Сгорели по сроку действия. */
  EXPIRED = 'EXPIRED',
  /** Отменены (например, при отмене брони). */
  CANCELLED = 'CANCELLED',
}

/** Уровни программы лояльности (§13.4). */
export enum LoyaltyTier {
  MEMBER = 'MEMBER',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
}

/** Статусы онлайн-регистрации (§8.3). */
export enum CheckinStatus {
  NOT_STARTED = 'NOT_STARTED',
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_FIX = 'NEEDS_FIX',
}

/** Тип цифрового доступа TTLock (§9.2). */
export enum KeyType {
  PIN = 'PIN',
  BLUETOOTH_EKEY = 'BLUETOOTH_EKEY',
  GATEWAY = 'GATEWAY',
  /** Резервный код администратора. */
  ADMIN_BACKUP = 'ADMIN_BACKUP',
  /** Доступ для персонала. */
  STAFF = 'STAFF',
}

/** Статус цифрового ключа. */
export enum KeyStatus {
  /** Ещё не выдан (не выполнены условия). */
  NOT_ISSUED = 'NOT_ISSUED',
  /** Создаётся в TTLock. */
  ISSUING = 'ISSUING',
  /** Активен и доступен гостю. */
  ACTIVE = 'ACTIVE',
  /** Отозван/удалён (после выезда или вручную). */
  REVOKED = 'REVOKED',
  /** Ошибка создания. */
  FAILED = 'FAILED',
}

/** Объект, который открывает ключ (§9.5). */
export enum LockTarget {
  ENTRANCE = 'ENTRANCE',
  BUILDING_DOOR = 'BUILDING_DOOR',
  FLOOR = 'FLOOR',
  ROOM = 'ROOM',
  COWORKING = 'COWORKING',
  PARKING = 'PARKING',
  SPA = 'SPA',
}

/** Тип заявки на обслуживание (§11.1). */
export enum ServiceRequestType {
  CLEANING = 'CLEANING',
  EXTRA_TOWELS = 'EXTRA_TOWELS',
  REPAIR = 'REPAIR',
  ACCESS_ISSUE = 'ACCESS_ISSUE',
  WIFI_ISSUE = 'WIFI_ISSUE',
  BABY_COT = 'BABY_COT',
  LINEN_CHANGE = 'LINEN_CHANGE',
  LUGGAGE = 'LUGGAGE',
  OTHER = 'OTHER',
}

/** Статус заявки (§11.2). */
export enum ServiceRequestStatus {
  NEW = 'NEW',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
  NEEDS_CLARIFICATION = 'NEEDS_CLARIFICATION',
}

/** Канал уведомления (§16). */
export enum NotificationChannel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  /** Telegram-бот (гость привязал chatId deep-link-авторизацией, §13). */
  TELEGRAM = 'TELEGRAM',
}

/** Тип согласия гостя (152-ФЗ, §5.3). */
export enum ConsentType {
  /** Обработка персональных данных. */
  PERSONAL_DATA = 'PERSONAL_DATA',
  /** Маркетинговые коммуникации. */
  MARKETING = 'MARKETING',
  /** Правила проживания. */
  HOUSE_RULES = 'HOUSE_RULES',
}
