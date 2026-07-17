import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для Umnico (токен зашифрован). */
const K = {
  token: 'ai.umnico.token',
} as const;

/** Подключённый в Umnico канал (интеграция). */
export interface UmnicoChannel {
  id: number;
  type: string;
  login: string;
  status: string;
  /** Человекочитаемая подпись для селектов. */
  label: string;
}

export interface UmnicoPublicConfig {
  tokenSet: boolean;
  connected: boolean;
  /** Список подключённых каналов (если токен валиден). */
  channels: UmnicoChannel[];
}

/** Русские подписи типов каналов Umnico. */
const TYPE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  whatsappV2: 'WhatsApp',
  telebot: 'Telegram-бот',
  telegram: 'Telegram',
  telegramV2: 'Telegram',
  instagramV3: 'Instagram',
  fb_messenger: 'Facebook Messenger',
  viber: 'Viber',
  vk: 'ВКонтакте',
  avito: 'Avito',
  ok: 'Одноклассники',
};

/**
 * Конфигурация Umnico (омниканальный агрегатор): токен API вводится в админке и
 * хранится в Setting (зашифрован). Через Umnico подключаются WhatsApp, Telegram,
 * VK, Avito и др. без возни с прокси/api_id — этим занимается Umnico. По аналогии
 * с TelegramConfigService/MaxConfigService.
 */
@Injectable()
export class UmnicoConfigService {
  private readonly logger = new Logger(UmnicoConfigService.name);
  private readonly base: string;

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.base = this.config.get('UMNICO_API_BASE', { infer: true });
  }

  get apiBase(): string {
    return this.base;
  }

  /** Токен (Setting поверх env), расшифрованный. */
  async token(): Promise<string> {
    const enc = await this.settings.get(K.token);
    return this.decrypt(enc) || this.config.get('UMNICO_TOKEN', { infer: true }) || '';
  }

  async hasToken(): Promise<boolean> {
    return !!(await this.token());
  }

  async save(input: { token?: string }): Promise<void> {
    if (input.token) await this.settings.set(K.token, this.crypto.encryptPii(input.token.trim()));
  }

  /** Заголовки авторизации Umnico (Bearer JWT). */
  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  }

  /** Список подключённых каналов из Umnico (GET /v1.3/integrations). */
  async listChannels(): Promise<UmnicoChannel[]> {
    const token = await this.token();
    if (!token) return [];
    try {
      const res = await fetch(`${this.base}/v1.3/integrations`, { headers: this.authHeaders(token) });
      if (!res.ok) return [];
      const data = (await res.json()) as { id: number; type: string; login?: string; status?: string }[];
      return (Array.isArray(data) ? data : []).map((i) => ({
        id: i.id,
        type: i.type,
        login: i.login ?? '',
        status: i.status ?? '',
        label: `${TYPE_LABEL[i.type] ?? i.type}${i.login ? ` · ${i.login}` : ''}`,
      }));
    } catch (e) {
      this.logger.warn(`listChannels: ${(e as Error).message}`);
      return [];
    }
  }

  async getPublicConfig(): Promise<UmnicoPublicConfig> {
    const has = await this.hasToken();
    const channels = has ? await this.listChannels() : [];
    return { tokenSet: has, connected: has, channels };
  }

  /** Проверка подключения: GET /v1.3/integrations. */
  async testConnection(token?: string): Promise<{ ok: boolean; message: string }> {
    const t = (token && token.trim()) || (await this.token());
    if (!t) return { ok: false, message: 'Не задан токен Umnico — введите его в поле выше.' };
    try {
      const res = await fetch(`${this.base}/v1.3/integrations`, { headers: this.authHeaders(t) });
      if (res.ok) {
        const data = (await res.json().catch(() => [])) as unknown[];
        const n = Array.isArray(data) ? data.length : 0;
        return { ok: true, message: `Подключение успешно: каналов в Umnico — ${n}.` };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Токен отклонён (401/403) — проверьте API-токен в настройках Umnico.' };
      return { ok: false, message: `Umnico вернул статус ${res.status}.` };
    } catch (e) {
      return { ok: false, message: `Сеть/адрес недоступны: ${(e as Error).message}` };
    }
  }

  /** Отправка сообщения: POST /v1.3/messaging/<leadId>/send. */
  async sendMessage(target: { leadId: string; source?: string; userId?: string }, text: string): Promise<void> {
    const token = await this.token();
    if (!token || !target.leadId) {
      this.logger.warn('Umnico: нет токена или leadId — сообщение не отправлено.');
      return;
    }
    const body: Record<string, unknown> = { message: { text } };
    if (target.source) body.source = target.source;
    if (target.userId) body.userId = target.userId;
    const res = await fetch(`${this.base}/v1.3/messaging/${encodeURIComponent(target.leadId)}/send`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
    }).catch((err: unknown) => {
      this.logger.error(`Umnico send сеть: ${(err as Error).message}`);
      return null;
    });
    if (res && !res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Umnico send ${res.status}: ${detail.slice(0, 300)}`);
    }
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать токен Umnico: ${(e as Error).message}`);
      return '';
    }
  }
}
