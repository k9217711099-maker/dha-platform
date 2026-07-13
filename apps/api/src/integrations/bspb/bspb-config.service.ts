import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для реквизитов подключения БСПБ (пароль — в зашифрованном виде). */
const K = {
  apiBase: 'finance.bspb.apiBase',
  merchantId: 'finance.bspb.merchantId',
  username: 'finance.bspb.username',
  password: 'finance.bspb.password',
} as const;

/** Полные реквизиты подключения (с расшифрованным паролем) — для адаптера. */
export interface BspbCredentials {
  apiBase: string;
  merchantId: string;
  username: string;
  password: string;
  certPath?: string;
  keyPath?: string;
}

/** Публичная конфигурация (без пароля) — для админки. */
export interface BspbPublicConfig {
  apiBase: string;
  merchantId: string;
  username: string;
  /** Пароль задан (в БД или env) — сам пароль наружу не отдаём. */
  passwordSet: boolean;
  /** Реквизитов достаточно для работы (merchant + логин + пароль). */
  connected: boolean;
}

/** Что можно изменить из админки. */
export interface BspbConnectionInput {
  apiBase?: string;
  merchantId?: string;
  username?: string;
  /** Непустой пароль → сохраняем (шифруем); пусто/undefined → оставляем прежний. */
  password?: string;
}

/**
 * Конфигурация подключения к эквайрингу БСПБ. Реквизиты вводятся в админке и
 * хранятся в Setting (пароль шифруется AES-256-GCM через CryptoService); env
 * используется как запасной вариант. Адаптер читает их динамически — смена
 * реквизитов в UI включает интеграцию без правки .env и перезапуска.
 */
@Injectable()
export class BspbConfigService {
  private readonly logger = new Logger(BspbConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Полные реквизиты (Setting поверх env) с расшифрованным паролем — для адаптера. */
  async resolve(): Promise<BspbCredentials> {
    const [apiBase, merchantId, username, encPass] = await Promise.all([
      this.settings.get(K.apiBase),
      this.settings.get(K.merchantId),
      this.settings.get(K.username),
      this.settings.get(K.password),
    ]);
    return {
      apiBase: apiBase || this.config.get('BSPB_API_BASE', { infer: true }),
      merchantId: merchantId || this.config.get('BSPB_MERCHANT_ID', { infer: true }) || '',
      username: username || this.config.get('BSPB_USERNAME', { infer: true }) || '',
      password: this.decryptPassword(encPass) || this.config.get('BSPB_PASSWORD', { infer: true }) || '',
      certPath: this.config.get('BSPB_CERT_PATH', { infer: true }),
      keyPath: this.config.get('BSPB_CERT_KEY_PATH', { infer: true }),
    };
  }

  /** Публичная конфигурация для админки (без пароля). */
  async getPublicConfig(): Promise<BspbPublicConfig> {
    const c = await this.resolve();
    return {
      apiBase: c.apiBase,
      merchantId: c.merchantId,
      username: c.username,
      passwordSet: !!c.password,
      connected: !!c.merchantId && !!c.username && !!c.password,
    };
  }

  /** Сохранить реквизиты подключения из админки. */
  async save(input: BspbConnectionInput): Promise<void> {
    if (input.apiBase !== undefined) await this.settings.set(K.apiBase, input.apiBase.trim());
    if (input.merchantId !== undefined) await this.settings.set(K.merchantId, input.merchantId.trim());
    if (input.username !== undefined) await this.settings.set(K.username, input.username.trim());
    if (input.password) await this.settings.set(K.password, this.crypto.encryptPii(input.password));
  }

  private decryptPassword(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать пароль БСПБ: ${(e as Error).message}`);
      return '';
    }
  }
}
