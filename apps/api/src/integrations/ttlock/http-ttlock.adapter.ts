import { createHash, randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtlockPort } from './ttlock.port.js';
import type {
  CreatePasscodeRequest,
  EkeyResult,
  LockRecord,
  LockSummary,
  PasscodeResult,
  SendEkeyRequest,
} from './ttlock.types.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи настроек учётной записи TTLock (редактируются в админке). */
export const TTLOCK_SETTING_USERNAME = 'ttlock.username';
export const TTLOCK_SETTING_PASSWORD = 'ttlock.password';

const md5 = (s: string): string => createHash('md5').update(s).digest('hex');

/** Коды типов событий журнала TTLock → текст. */
const RECORD_TYPES: Record<number, string> = {
  1: 'Открытие из приложения',
  4: 'Открытие PIN-кодом',
  7: 'Открытие картой',
  8: 'Открытие отпечатком',
  11: 'Открытие eKey',
  12: 'Удалённое открытие',
  46: 'Открытие изнутри',
  47: 'Открытие снаружи',
};

/**
 * Реальный адаптер TTLock Cloud API (Sciener). OAuth2 password grant + управление
 * PIN-кодами (keyboardPwd). Для удалённой записи кода на объекте нужен шлюз (gateway).
 * Включается TTLOCK_PROVIDER=http (нужны clientId/secret + аккаунт-владелец замков).
 */
@Injectable()
export class HttpTtlockAdapter extends TtlockPort {
  private readonly logger = new Logger('HttpTtlockAdapter');
  private readonly base: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly envUsername: string;
  private readonly envPassword: string;
  private readonly mode: 'get' | 'add';
  private readonly addType: number;

  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
  ) {
    super();
    this.base = config.get('TTLOCK_API_BASE', { infer: true });
    this.clientId = config.get('TTLOCK_CLIENT_ID', { infer: true }) ?? '';
    this.clientSecret = config.get('TTLOCK_CLIENT_SECRET', { infer: true }) ?? '';
    this.envUsername = config.get('TTLOCK_USERNAME', { infer: true }) ?? '';
    this.envPassword = config.get('TTLOCK_PASSWORD', { infer: true }) ?? '';
    this.mode = config.get('TTLOCK_PASSCODE_MODE', { infer: true });
    this.addType = config.get('TTLOCK_ADD_TYPE', { infer: true });
  }

  invalidateToken(): void {
    this.token = null;
  }

  async createPasscode(req: CreatePasscodeRequest): Promise<PasscodeResult> {
    const mode = req.mode ?? this.mode;
    // get: код генерирует TTLock по алгоритму (без шлюза). add: свой код (нужен шлюз/BT).
    if (mode === 'get') {
      // Офлайн-код не может начинаться в прошлом — ограничиваем старт текущим моментом.
      const startDate = Math.max(req.startMs, Date.now() + 60_000);
      const data = await this.post('/v3/keyboardPwd/get', {
        lockId: req.lockId,
        keyboardPwdType: 3, // период
        startDate,
        endDate: req.endMs,
      });
      return { ttlockKeyId: String(data.keyboardPwdId), pin: String(data.keyboardPwd) };
    }

    const pin = req.pin ?? randomInt(0, 1_000_000).toString().padStart(6, '0');
    const data = await this.post('/v3/keyboardPwd/add', {
      lockId: req.lockId,
      keyboardPwd: pin,
      keyboardPwdName: req.name ?? 'D H&A',
      keyboardPwdType: 3,
      startDate: req.startMs,
      endDate: req.endMs,
      addType: this.addType,
    });
    return { ttlockKeyId: String(data.keyboardPwdId), pin };
  }

  async deletePasscode(lockId: string, ttlockKeyId: string): Promise<void> {
    await this.post('/v3/keyboardPwd/delete', {
      lockId,
      keyboardPwdId: ttlockKeyId,
      deleteType: 2, // через шлюз
    });
  }

  async listLocks(): Promise<LockSummary[]> {
    const data = await this.post('/v3/lock/list', { pageNo: 1, pageSize: 200 });
    const list = (data.list ?? []) as { lockId: number; lockAlias?: string; hasGateway?: number }[];
    return list.map((l) => ({
      ttlockLockId: String(l.lockId),
      name: l.lockAlias ?? `Замок ${l.lockId}`,
      hasGateway: l.hasGateway === 1,
    }));
  }

  async unlock(lockId: string): Promise<void> {
    await this.post('/v3/lock/unlock', { lockId });
  }

  async sendEkey(req: SendEkeyRequest): Promise<EkeyResult> {
    const data = await this.post('/v3/key/send', {
      lockId: req.lockId,
      receiverUsername: req.receiverUsername,
      keyName: req.name ?? 'D H&A',
      startDate: req.startMs,
      endDate: req.endMs,
      remarks: req.remarks ?? '',
    });
    return { keyId: String(data.keyId ?? '') };
  }

  async getRecords(lockId: string, startMs: number, endMs: number): Promise<LockRecord[]> {
    const data = await this.post('/v3/lockRecord/list', {
      lockId,
      startDate: startMs,
      endDate: endMs,
      pageNo: 1,
      pageSize: 100,
    });
    const list = (data.list ?? []) as {
      recordType?: number;
      recordTypeFromLock?: number;
      success?: number;
      username?: string;
      keyboardPwd?: string;
      lockDate?: number;
    }[];
    return list.map((r) => ({
      type: RECORD_TYPES[r.recordType ?? -1] ?? `тип ${r.recordType ?? '—'}`,
      success: r.success === 1,
      who: r.username || r.keyboardPwd || '—',
      at: r.lockDate ?? 0,
    }));
  }

  // --- OAuth ---
  private async creds(): Promise<{ username: string; password: string }> {
    const username = (await this.settings.get(TTLOCK_SETTING_USERNAME)) ?? this.envUsername;
    const password = (await this.settings.get(TTLOCK_SETTING_PASSWORD)) ?? this.envPassword;
    return { username, password };
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const { username, password } = await this.creds();

    const res = await fetch(`${this.base}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        grant_type: 'password',
        username,
        password: md5(password),
      }).toString(),
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    };
    if (!data.access_token) {
      throw new Error(`TTLock OAuth: ${data.errmsg ?? 'нет access_token'} (${data.errcode})`);
    }
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7776000) * 1000,
    };
    return this.token.value;
  }

  /** POST с авторизацией; бросает при ненулевом errcode TTLock. */
  private async post(
    path: string,
    params: Record<string, string | number>,
  ): Promise<Record<string, unknown>> {
    const accessToken = await this.getToken();
    const body = new URLSearchParams({
      clientId: this.clientId,
      accessToken,
      date: String(Date.now()),
    });
    for (const [k, v] of Object.entries(params)) body.set(k, String(v));

    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      this.logger.error(`TTLock ${path}: ${String(data.errmsg)} (${data.errcode})`);
      throw new Error(`TTLock ${path}: ${String(data.errmsg)} (${data.errcode})`);
    }
    return data;
  }
}
