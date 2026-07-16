import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для реквизитов Bnovo (ключ API — в зашифрованном виде). */
const K = {
  accountId: 'bnovo.accountId',
  apiKey: 'bnovo.apiKey',
} as const;

/** Полные реквизиты Bnovo (с расшифрованным ключом) — для авторизации. */
export interface BnovoCredentials {
  baseUrl: string;
  accountId?: number;
  apiKey?: string;
}

/** Публичная конфигурация (без ключа) — для админки. */
export interface BnovoPublicConfig {
  accountId: number | null;
  /** Ключ API задан (в БД или env) — сам ключ наружу не отдаём. */
  apiKeySet: boolean;
  /** Реквизитов достаточно для подключения (accountId + apiKey). */
  connected: boolean;
}

/** Что можно изменить из админки. */
export interface BnovoConnectionInput {
  accountId?: number;
  /** Непустой ключ → сохраняем (шифруем); пусто/undefined → оставляем прежний. */
  apiKey?: string;
}

/**
 * Конфигурация подключения к Bnovo. Реквизиты (id аккаунта + ключ API) вводятся в
 * админке и хранятся в Setting (ключ шифруется AES-256-GCM через CryptoService); env
 * — запасной вариант. Читается динамически — смена в UI работает без правки .env и
 * перезапуска сервиса.
 */
@Injectable()
export class BnovoConfigService {
  private readonly logger = new Logger(BnovoConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Полные реквизиты (Setting поверх env) с расшифрованным ключом. */
  async resolve(): Promise<BnovoCredentials> {
    const [accountId, encKey] = await Promise.all([
      this.settings.get(K.accountId),
      this.settings.get(K.apiKey),
    ]);
    const accId = accountId ? Number(accountId) : this.config.get('BNOVO_ACCOUNT_ID', { infer: true });
    return {
      baseUrl: this.config.get('BNOVO_API_BASE', { infer: true }),
      accountId: Number.isFinite(accId) ? accId : undefined,
      apiKey: this.decryptKey(encKey) || this.config.get('BNOVO_API_KEY', { infer: true }) || undefined,
    };
  }

  /** Публичная конфигурация для админки (без ключа). */
  async getPublicConfig(): Promise<BnovoPublicConfig> {
    const c = await this.resolve();
    return {
      accountId: c.accountId ?? null,
      apiKeySet: !!c.apiKey,
      connected: !!c.accountId && !!c.apiKey,
    };
  }

  /** Сохранить реквизиты подключения из админки. */
  async save(input: BnovoConnectionInput): Promise<void> {
    if (input.accountId !== undefined) await this.settings.set(K.accountId, String(input.accountId));
    if (input.apiKey) await this.settings.set(K.apiKey, this.crypto.encryptPii(input.apiKey.trim()));
  }

  private decryptKey(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать ключ Bnovo: ${(e as Error).message}`);
      return '';
    }
  }
}
