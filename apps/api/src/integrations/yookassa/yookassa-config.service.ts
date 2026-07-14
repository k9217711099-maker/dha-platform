import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для реквизитов ЮKassa (секретный ключ — в шифре). */
const K = {
  shopId: 'finance.yookassa.shopId',
  secretKey: 'finance.yookassa.secretKey',
} as const;

/** Полные реквизиты (с расшифрованным секретным ключом) — для адаптера. */
export interface YooKassaCredentials {
  shopId: string;
  secretKey: string;
}

/** Публичная конфигурация (без секрета) — для админки. */
export interface YooKassaPublicConfig {
  shopId: string;
  secretKeySet: boolean;
  /** Реквизитов достаточно для работы (shopId + секретный ключ). */
  connected: boolean;
}

/** Что можно изменить из админки (пустой ключ = не менять секрет). */
export interface YooKassaConnectionInput {
  shopId?: string;
  secretKey?: string;
}

/**
 * Конфигурация подключения ЮKassa. shopId и секретный ключ вводятся в админке и
 * хранятся в Setting (секретный ключ шифруется AES-256-GCM); env — запас. Адаптер
 * читает их динамически — смена в UI включает интеграцию без правки .env/рестарта.
 */
@Injectable()
export class YooKassaConfigService {
  private readonly logger = new Logger(YooKassaConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async resolve(): Promise<YooKassaCredentials> {
    const [shopId, encKey] = await Promise.all([
      this.settings.get(K.shopId),
      this.settings.get(K.secretKey),
    ]);
    return {
      shopId: shopId || this.config.get('YOOKASSA_SHOP_ID', { infer: true }) || '',
      secretKey: this.decrypt(encKey) || this.config.get('YOOKASSA_SECRET_KEY', { infer: true }) || '',
    };
  }

  async getPublicConfig(): Promise<YooKassaPublicConfig> {
    const c = await this.resolve();
    return {
      shopId: c.shopId,
      secretKeySet: !!c.secretKey,
      connected: !!c.shopId && !!c.secretKey,
    };
  }

  async save(input: YooKassaConnectionInput): Promise<void> {
    if (input.shopId !== undefined) await this.settings.set(K.shopId, input.shopId.trim());
    if (input.secretKey) await this.settings.set(K.secretKey, this.crypto.encryptPii(input.secretKey));
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать секретный ключ ЮKassa: ${(e as Error).message}`);
      return '';
    }
  }
}
