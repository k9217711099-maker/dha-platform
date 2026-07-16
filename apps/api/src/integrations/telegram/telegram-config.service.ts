import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { withProxy } from '../../common/proxy/messenger-proxy.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для подключения Telegram-бота (токен/секрет — зашифрованы). */
const K = {
  botToken: 'ai.telegram.botToken',
  botUsername: 'ai.telegram.botUsername',
  webhookSecret: 'ai.telegram.webhookSecret',
} as const;

/** Полные реквизиты бота (с расшифрованными секретами) — для адаптера/вебхука. */
export interface TelegramCredentials {
  apiBase: string;
  botToken: string;
  botUsername: string;
  webhookSecret: string;
}

/** Публичная конфигурация (без секретов) — для админки. */
export interface TelegramPublicConfig {
  botUsername: string;
  /** Токен бота задан (в БД или env) — сам токен наружу не отдаём. */
  tokenSet: boolean;
  /** Секрет вебхука задан. */
  webhookSecretSet: boolean;
  /** Достаточно реквизитов для работы (есть токен). */
  connected: boolean;
  /** Ссылка t.me/<bot> для гостей (если задан username). */
  botLink: string | null;
}

/** Что можно изменить из админки. Пустая строка/undefined — не менять. */
export interface TelegramConnectionInput {
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
}

/**
 * Конфигурация подключения Telegram-бота гостевого AI-агента (§9). Реквизиты
 * вводятся в админке и хранятся в Setting (токен и секрет вебхука шифруются
 * AES-256-GCM через CryptoService); env используется как запасной вариант.
 * Адаптер и вебхук читают их динамически — ввод токена в UI включает канал
 * без правки .env и перезапуска.
 */
@Injectable()
export class TelegramConfigService {
  private readonly logger = new Logger(TelegramConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Полные реквизиты (Setting поверх env) с расшифрованными секретами. */
  async resolve(): Promise<TelegramCredentials> {
    const [botUsername, encToken, encSecret] = await Promise.all([
      this.settings.get(K.botUsername),
      this.settings.get(K.botToken),
      this.settings.get(K.webhookSecret),
    ]);
    return {
      apiBase: this.config.get('TELEGRAM_API_BASE', { infer: true }),
      botToken: this.decrypt(encToken) || this.config.get('TELEGRAM_BOT_TOKEN', { infer: true }) || '',
      botUsername: botUsername || this.config.get('TELEGRAM_BOT_USERNAME', { infer: true }) || '',
      webhookSecret:
        this.decrypt(encSecret) || this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }) || '',
    };
  }

  /** Есть ли токен (в Setting или env) — сообщение реально уйдёт в Telegram. */
  async hasToken(): Promise<boolean> {
    return !!(await this.resolve()).botToken;
  }

  /** Публичная конфигурация для админки (без секретов). */
  async getPublicConfig(): Promise<TelegramPublicConfig> {
    const c = await this.resolve();
    return {
      botUsername: c.botUsername,
      tokenSet: !!c.botToken,
      webhookSecretSet: !!c.webhookSecret,
      connected: !!c.botToken,
      botLink: c.botUsername ? `https://t.me/${c.botUsername.replace(/^@/, '')}` : null,
    };
  }

  /** Сохранить реквизиты подключения из админки. */
  async save(input: TelegramConnectionInput): Promise<void> {
    if (input.botUsername !== undefined) {
      await this.settings.set(K.botUsername, input.botUsername.trim().replace(/^@/, ''));
    }
    if (input.botToken) await this.settings.set(K.botToken, this.crypto.encryptPii(input.botToken.trim()));
    if (input.webhookSecret) {
      await this.settings.set(K.webhookSecret, this.crypto.encryptPii(input.webhookSecret.trim()));
    }
  }

  /**
   * Проверка подключения: запрос getMe к Bot API с указанным (или сохранённым)
   * токеном. Возвращает { ok, message } — как проверка эквайринга в финансах.
   */
  async testConnection(botToken?: string): Promise<{ ok: boolean; message: string }> {
    const creds = await this.resolve();
    const token = (botToken && botToken.trim()) || creds.botToken;
    if (!token) return { ok: false, message: 'Не задан токен бота — введите его в поле выше.' };
    try {
      const proxy = this.config.get('MESSENGER_PROXY_URL', { infer: true });
      const res = await fetch(`${creds.apiBase}/bot${token}/getMe`, withProxy({}, proxy));
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { username?: string; first_name?: string };
        description?: string;
      };
      if (res.ok && data.ok && data.result) {
        const uname = data.result.username ? `@${data.result.username}` : data.result.first_name ?? 'бот';
        return { ok: true, message: `Подключение успешно: ${uname}` };
      }
      return { ok: false, message: data.description || `Bot API вернул статус ${res.status}` };
    } catch (e) {
      return { ok: false, message: `Сеть/адрес недоступны: ${(e as Error).message}` };
    }
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать секрет Telegram: ${(e as Error).message}`);
      return '';
    }
  }
}
