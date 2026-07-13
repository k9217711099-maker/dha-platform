import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для реквизитов PayKeeper (пароль и секрет — в шифре). */
const K = {
  server: 'finance.paykeeper.server',
  user: 'finance.paykeeper.user',
  password: 'finance.paykeeper.password',
  secret: 'finance.paykeeper.secret',
} as const;

/** Полные реквизиты (с расшифрованными секретами) — для адаптера. */
export interface PaykeeperCredentials {
  server: string;
  user: string;
  password: string;
  /** «Секретное слово» для проверки подписи callback. */
  secret: string;
}

/** Публичная конфигурация (без секретов) — для админки. */
export interface PaykeeperPublicConfig {
  server: string;
  user: string;
  passwordSet: boolean;
  secretSet: boolean;
  /** Реквизитов достаточно для работы (адрес + логин + пароль). */
  connected: boolean;
}

/** Что можно изменить из админки (пусто = не менять секрет). */
export interface PaykeeperConnectionInput {
  server?: string;
  user?: string;
  password?: string;
  secret?: string;
}

/**
 * Конфигурация подключения PayKeeper. Реквизиты вводятся в админке и хранятся в
 * Setting (пароль и секретное слово шифруются AES-256-GCM); env — запас. Адаптер
 * читает их динамически — смена в UI включает интеграцию без правки .env/рестарта.
 */
@Injectable()
export class PaykeeperConfigService {
  private readonly logger = new Logger(PaykeeperConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async resolve(): Promise<PaykeeperCredentials> {
    const [server, user, encPass, encSecret] = await Promise.all([
      this.settings.get(K.server),
      this.settings.get(K.user),
      this.settings.get(K.password),
      this.settings.get(K.secret),
    ]);
    return {
      server: (server || this.config.get('PAYKEEPER_SERVER', { infer: true }) || '').replace(/\/$/, ''),
      user: user || this.config.get('PAYKEEPER_USER', { infer: true }) || '',
      password: this.decrypt(encPass) || this.config.get('PAYKEEPER_PASSWORD', { infer: true }) || '',
      secret: this.decrypt(encSecret) || this.config.get('PAYKEEPER_SECRET', { infer: true }) || '',
    };
  }

  async getPublicConfig(): Promise<PaykeeperPublicConfig> {
    const c = await this.resolve();
    return {
      server: c.server,
      user: c.user,
      passwordSet: !!c.password,
      secretSet: !!c.secret,
      connected: !!c.server && !!c.user && !!c.password,
    };
  }

  async save(input: PaykeeperConnectionInput): Promise<void> {
    if (input.server !== undefined) await this.settings.set(K.server, input.server.trim());
    if (input.user !== undefined) await this.settings.set(K.user, input.user.trim());
    if (input.password) await this.settings.set(K.password, this.crypto.encryptPii(input.password));
    if (input.secret) await this.settings.set(K.secret, this.crypto.encryptPii(input.secret));
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать секрет PayKeeper: ${(e as Error).message}`);
      return '';
    }
  }
}
