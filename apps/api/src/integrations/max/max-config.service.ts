import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для подключения MAX-бота (токен/секрет — зашифрованы). */
const K = {
  botToken: 'ai.max.botToken',
  botUsername: 'ai.max.botUsername',
  webhookSecret: 'ai.max.webhookSecret',
} as const;

/** Полные реквизиты MAX-бота (с расшифрованными секретами). */
export interface MaxCredentials {
  apiBase: string;
  botToken: string;
  botUsername: string;
  webhookSecret: string;
}

/** Публичная конфигурация (без секретов) — для админки. */
export interface MaxPublicConfig {
  botUsername: string;
  tokenSet: boolean;
  webhookSecretSet: boolean;
  connected: boolean;
  /** Ссылка max.ru/<bot> для гостей (если задан username). */
  botLink: string | null;
}

/** Что можно изменить из админки. Пустая строка/undefined — не менять. */
export interface MaxConnectionInput {
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
}

/**
 * Конфигурация MAX-бота гостевого AI-агента. Токен выдаёт @MasterBot в MAX;
 * вводится в админке и хранится в Setting (токен и секрет вебхука шифруются
 * AES-256-GCM через CryptoService), env — запасной вариант. Адаптер и приёмник
 * читают реквизиты динамически — ввод токена включает канал без правки .env.
 * MAX — российская площадка, доступна с РФ-сервера напрямую (прокси не нужен).
 */
@Injectable()
export class MaxConfigService {
  private readonly logger = new Logger(MaxConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Полные реквизиты (Setting поверх env) с расшифрованными секретами. */
  async resolve(): Promise<MaxCredentials> {
    const [botUsername, encToken, encSecret] = await Promise.all([
      this.settings.get(K.botUsername),
      this.settings.get(K.botToken),
      this.settings.get(K.webhookSecret),
    ]);
    return {
      apiBase: this.config.get('MAX_API_BASE', { infer: true }),
      botToken: this.decrypt(encToken) || this.config.get('MAX_BOT_TOKEN', { infer: true }) || '',
      botUsername: botUsername || '',
      webhookSecret:
        this.decrypt(encSecret) || this.config.get('MAX_WEBHOOK_SECRET', { infer: true }) || '',
    };
  }

  /** Есть ли токен (в Setting или env) — сообщение реально уйдёт в MAX. */
  async hasToken(): Promise<boolean> {
    return !!(await this.resolve()).botToken;
  }

  /** Публичная конфигурация для админки (без секретов). */
  async getPublicConfig(): Promise<MaxPublicConfig> {
    const c = await this.resolve();
    return {
      botUsername: c.botUsername,
      tokenSet: !!c.botToken,
      webhookSecretSet: !!c.webhookSecret,
      connected: !!c.botToken,
      botLink: c.botUsername ? `https://max.ru/${c.botUsername.replace(/^@/, '')}` : null,
    };
  }

  /** Сохранить реквизиты подключения из админки. */
  async save(input: MaxConnectionInput): Promise<void> {
    if (input.botUsername !== undefined) {
      await this.settings.set(K.botUsername, input.botUsername.trim().replace(/^@/, ''));
    }
    if (input.botToken) await this.settings.set(K.botToken, this.crypto.encryptPii(input.botToken.trim()));
    if (input.webhookSecret) {
      await this.settings.set(K.webhookSecret, this.crypto.encryptPii(input.webhookSecret.trim()));
    }
  }

  /**
   * Проверка подключения: GET /me к MAX Bot API с указанным (или сохранённым)
   * токеном. Возвращает { ok, message } — как проверка Telegram/эквайринга.
   */
  async testConnection(botToken?: string): Promise<{ ok: boolean; message: string }> {
    const creds = await this.resolve();
    const token = (botToken && botToken.trim()) || creds.botToken;
    if (!token) return { ok: false, message: 'Не задан токен бота — введите его в поле выше.' };
    try {
      const res = await fetch(`${creds.apiBase}/me`, { headers: { Authorization: token } });
      const data = (await res.json().catch(() => ({}))) as {
        user_id?: number;
        name?: string;
        username?: string;
        message?: string;
      };
      if (res.ok && (data.user_id || data.name)) {
        const uname = data.username ? `@${data.username}` : data.name ?? 'бот';
        return { ok: true, message: `Подключение успешно: ${uname}` };
      }
      return { ok: false, message: data.message || `Bot API вернул статус ${res.status}` };
    } catch (e) {
      return { ok: false, message: `Сеть/адрес недоступны: ${(e as Error).message}` };
    }
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать секрет MAX: ${(e as Error).message}`);
      return '';
    }
  }
}
