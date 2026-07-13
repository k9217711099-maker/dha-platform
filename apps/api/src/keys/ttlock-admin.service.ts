import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtlockPort } from '../integrations/ttlock/ttlock.port.js';
import {
  TTLOCK_SETTING_PASSWORD,
  TTLOCK_SETTING_USERNAME,
} from '../integrations/ttlock/http-ttlock.adapter.js';
import { SettingsService } from '../common/settings/settings.service.js';
import type { Env } from '../config/env.schema.js';

/** Пульт TTLock для сотрудников: пароли, eKey, удалённое открытие, журнал, учётка. */
@Injectable()
export class TtlockAdminService {
  constructor(
    private readonly ttlock: TtlockPort,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  createPasscode(ttlockLockId: string, opts: { name?: string; pin?: string; startMs: number; endMs: number; mode?: 'get' | 'add' }) {
    return this.ttlock.createPasscode({
      lockId: ttlockLockId,
      name: opts.name,
      pin: opts.pin,
      startMs: opts.startMs,
      endMs: opts.endMs,
      mode: opts.mode,
    });
  }

  sendEkey(ttlockLockId: string, opts: { receiverUsername: string; name?: string; startMs: number; endMs: number; remarks?: string }) {
    return this.ttlock.sendEkey({
      lockId: ttlockLockId,
      receiverUsername: opts.receiverUsername,
      name: opts.name,
      startMs: opts.startMs,
      endMs: opts.endMs,
      remarks: opts.remarks,
    });
  }

  async unlock(ttlockLockId: string): Promise<{ ok: true }> {
    await this.ttlock.unlock(ttlockLockId);
    return { ok: true };
  }

  records(ttlockLockId: string, fromMs: number, toMs: number) {
    return this.ttlock.getRecords(ttlockLockId, fromMs, toMs);
  }

  /** Текущая учётка TTLock (без пароля). */
  async getCredentials(): Promise<{ username: string; source: 'settings' | 'env'; hasPassword: boolean }> {
    const u = await this.settings.get(TTLOCK_SETTING_USERNAME);
    const p = await this.settings.get(TTLOCK_SETTING_PASSWORD);
    if (u) return { username: u, source: 'settings', hasPassword: !!p };
    return {
      username: this.config.get('TTLOCK_USERNAME', { infer: true }) ?? '',
      source: 'env',
      hasPassword: !!this.config.get('TTLOCK_PASSWORD', { infer: true }),
    };
  }

  /** Сохранить учётку TTLock (личный кабинет) и сбросить кэш токена. */
  async setCredentials(username: string, password?: string): Promise<{ ok: true }> {
    await this.settings.set(TTLOCK_SETTING_USERNAME, username.trim());
    if (password) await this.settings.set(TTLOCK_SETTING_PASSWORD, password);
    this.ttlock.invalidateToken();
    return { ok: true };
  }
}
