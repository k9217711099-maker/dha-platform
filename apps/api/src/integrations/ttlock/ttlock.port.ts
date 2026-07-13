import type {
  CreatePasscodeRequest,
  EkeyResult,
  LockRecord,
  LockSummary,
  PasscodeResult,
  SendEkeyRequest,
} from './ttlock.types.js';

/**
 * Порт интеграции с TTLock. Бизнес-логика выдачи ключа зависит только от него.
 * Реализации: MockTtlockAdapter (разработка) и HttpTtlockAdapter (реальный API).
 */
export abstract class TtlockPort {
  /** Создать временный PIN-код доступа на окно действия. */
  abstract createPasscode(req: CreatePasscodeRequest): Promise<PasscodeResult>;

  /** Удалить/отозвать PIN-код (после выезда пароль удаляется, §9.4). */
  abstract deletePasscode(lockId: string, ttlockKeyId: string): Promise<void>;

  /** Список замков аккаунта (для импорта/привязки в админке). */
  abstract listLocks(): Promise<LockSummary[]>;

  /** Удалённо открыть замок через шлюз (работает из веба и приложения). */
  abstract unlock(lockId: string): Promise<void>;

  /** Отправить eKey (Bluetooth-ключ) на аккаунт получателя в TTLock. */
  abstract sendEkey(req: SendEkeyRequest): Promise<EkeyResult>;

  /** Журнал входов/событий замка за период. */
  abstract getRecords(lockId: string, startMs: number, endMs: number): Promise<LockRecord[]>;

  /** Сбросить кэш OAuth-токена (после смены учётных данных). */
  abstract invalidateToken(): void;
}
