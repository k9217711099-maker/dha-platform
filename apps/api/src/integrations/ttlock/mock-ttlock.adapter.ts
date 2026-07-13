import { randomInt, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { TtlockPort } from './ttlock.port.js';
import type {
  CreatePasscodeRequest,
  EkeyResult,
  LockRecord,
  LockSummary,
  PasscodeResult,
  SendEkeyRequest,
} from './ttlock.types.js';

/** In-memory реализация TTLock для разработки и тестов. */
@Injectable()
export class MockTtlockAdapter extends TtlockPort {
  private readonly logger = new Logger('MockTtlock');
  private readonly passcodes = new Map<string, { lockId: string; pin: string }>();

  async createPasscode(req: CreatePasscodeRequest): Promise<PasscodeResult> {
    const pin = req.pin ?? randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlockKeyId = `ttlock-${randomUUID()}`;
    this.passcodes.set(ttlockKeyId, { lockId: req.lockId, pin });
    return { ttlockKeyId, pin };
  }

  async deletePasscode(_lockId: string, ttlockKeyId: string): Promise<void> {
    this.passcodes.delete(ttlockKeyId);
  }

  async listLocks(): Promise<LockSummary[]> {
    return [
      { ttlockLockId: 'mock-lock-room', name: 'Дверь номера (мок)', hasGateway: false },
      { ttlockLockId: 'mock-lock-entrance', name: 'Подъезд (мок)', hasGateway: true },
      { ttlockLockId: 'mock-lock-parking', name: 'Паркинг (мок)', hasGateway: true },
    ];
  }

  async unlock(lockId: string): Promise<void> {
    this.logger.log(`(mock) удалённое открытие замка ${lockId}`);
  }

  async sendEkey(req: SendEkeyRequest): Promise<EkeyResult> {
    this.logger.log(`(mock) eKey на ${req.receiverUsername} для замка ${req.lockId}`);
    return { keyId: `mock-ekey-${randomUUID()}` };
  }

  async getRecords(lockId: string, _startMs: number, _endMs: number): Promise<LockRecord[]> {
    return [
      { type: 'Открытие PIN-кодом', success: true, who: '123456', at: Date.now() - 3_600_000 },
      { type: 'Открытие eKey', success: true, who: 'guest@dha.ru', at: Date.now() - 7_200_000 },
      { type: 'Открытие удалённо', success: true, who: 'admin', at: Date.now() - 86_400_000 },
    ];
  }

  invalidateToken(): void {
    /* mock: токена нет */
  }
}
