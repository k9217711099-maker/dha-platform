/** Типы интеграции TTLock (модель API замков). */

export interface CreatePasscodeRequest {
  /** Идентификатор замка в TTLock. */
  lockId: string;
  /** Желаемый PIN (или undefined — сгенерировать). */
  pin?: string;
  /** Начало действия (ms epoch). */
  startMs: number;
  /** Окончание действия (ms epoch). */
  endMs: number;
  /** Имя кода (для журнала TTLock). */
  name?: string;
  /** Режим: get — код по алгоритму TTLock (без шлюза), add — свой код (нужен шлюз/BT). */
  mode?: 'get' | 'add';
}

export interface PasscodeResult {
  /** ID кода в TTLock. */
  ttlockKeyId: string;
  pin: string;
}

export interface SendEkeyRequest {
  lockId: string;
  /** Аккаунт-получатель в TTLock (телефон/почта, зарегистрированный в TTLock). */
  receiverUsername: string;
  name?: string;
  startMs: number;
  endMs: number;
  remarks?: string;
}

export interface EkeyResult {
  keyId: string;
}

/** Запись журнала доступа замка. */
export interface LockRecord {
  /** Тип события (текст). */
  type: string;
  /** Успешно ли. */
  success: boolean;
  /** Кто (имя/код/eKey). */
  who: string;
  /** Время события (ms epoch). */
  at: number;
}

export interface LockSummary {
  ttlockLockId: string;
  name: string;
  hasGateway: boolean;
}
