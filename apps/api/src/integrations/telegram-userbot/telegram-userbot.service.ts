import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, type NewMessageEvent } from 'telegram/events';
import { computeCheck } from 'telegram/Password';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';
import { TelegramUserbotPort } from './telegram-userbot.port.js';

/** Ключи Setting для userbot (api_hash/сессия — зашифрованы). */
const K = {
  apiId: 'ai.tguserbot.apiId',
  apiHash: 'ai.tguserbot.apiHash',
  phone: 'ai.tguserbot.phone',
  session: 'ai.tguserbot.session',
} as const;

/** Ключ Setting тумблера канала (единый формат с ChannelToggleService). */
const ENABLED_KEY = 'ai.channel.tg_direct.enabled';

export type TgUserbotStatus =
  | 'disabled'
  | 'disconnected'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'connected';

export interface TgUserbotState {
  status: TgUserbotStatus;
  phone: string | null;
  me: string | null;
  message: string;
}

interface SocksProxy {
  ip: string;
  port: number;
  socksType: 5;
  username?: string;
  password?: string;
}

/** SOCKS5 из socks5://user:pass@host:port → объект proxy для GramJS. */
function parseSocks(url?: string): SocksProxy | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!u.hostname || !u.port) return undefined;
    return {
      ip: u.hostname,
      port: Number(u.port),
      socksType: 5,
      username: decodeURIComponent(u.username) || undefined,
      password: decodeURIComponent(u.password) || undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Telegram Direct (userbot, GramJS/MTProto): общение с гостями от ЛИЧНОГО аккаунта.
 * Вход двух-/трёхшаговый (телефон → код → 2FA-пароль) из админки; сессия
 * сохраняется зашифрованно в Setting и переживает перезапуск. Клиент ходит через
 * ОТДЕЛЬНЫЙ SOCKS5 (TG_USERBOT_PROXY). Входящие личные сообщения → гостевой агент.
 *
 * ⚠️ Неофициально, нарушает ToS Telegram — риск блокировки аккаунта. Дублирует
 * штатного бота; включать только при явной необходимости.
 */
@Injectable()
export class TelegramUserbotService
  extends TelegramUserbotPort
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('TelegramUserbot');
  private client: TelegramClient | null = null;
  private pending: { client: TelegramClient; phone: string; phoneCodeHash: string } | null = null;
  private status: TgUserbotStatus = 'disconnected';
  private me: string | null = null;
  private enabledCached = false;
  private handler: ((from: string, text: string) => Promise<void>) | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  /** Тумблер (Setting) с фолбэком на legacy-env TG_USERBOT_ENABLED. */
  private async loadEnabled(): Promise<boolean> {
    const v = await this.settings.get(ENABLED_KEY);
    this.enabledCached =
      v === null || v === undefined || v === ''
        ? this.config.get('TG_USERBOT_ENABLED', { infer: true })
        : v === 'true';
    return this.enabledCached;
  }
  private get proxy(): SocksProxy | undefined {
    return parseSocks(this.config.get('TG_USERBOT_PROXY', { infer: true }));
  }

  async onModuleInit(): Promise<void> {
    if (!(await this.loadEnabled())) {
      this.status = 'disabled';
      return;
    }
    void this.connectSaved();
  }

  /** Включить/выключить канал (тумблер из админки). */
  async setEnabled(on: boolean): Promise<TgUserbotState> {
    await this.settings.set(ENABLED_KEY, on ? 'true' : 'false');
    this.enabledCached = on;
    if (!on) {
      await this.client?.disconnect().catch(() => undefined);
      await this.pending?.client.disconnect().catch(() => undefined);
      this.client = null;
      this.pending = null;
      this.status = 'disabled';
    } else {
      this.status = 'disconnected';
      void this.connectSaved();
    }
    return this.getState();
  }

  onModuleDestroy(): void {
    void this.client?.disconnect().catch(() => undefined);
    void this.pending?.client.disconnect().catch(() => undefined);
  }

  registerHandler(fn: (from: string, text: string) => Promise<void>): void {
    this.handler = fn;
  }

  getState(): TgUserbotState {
    const phone = null; // телефон резолвится асинхронно; в getState не блокируемся
    const msg: Record<TgUserbotStatus, string> = {
      disabled: 'Канал выключен — включите переключателем. Для подключения нужен SOCKS5-прокси (TG_USERBOT_PROXY в .env).',
      disconnected: 'Не подключено. Введите api_id, api_hash (my.telegram.org) и телефон, затем «Подключить».',
      awaiting_code: 'Введите код, присланный в Telegram на этот номер.',
      awaiting_password: 'Включена двухэтапная проверка — введите облачный пароль (2FA).',
      connected: `Подключено${this.me ? ` как ${this.me}` : ''}.`,
    };
    return { status: this.status, phone, me: this.me, message: msg[this.status] };
  }

  /** Полная публичная конфигурация (с телефоном) — отдельным запросом. */
  async getPublicState(): Promise<TgUserbotState> {
    const phone = (await this.settings.get(K.phone)) || null;
    return { ...this.getState(), phone };
  }

  private async creds(input?: { apiId?: string; apiHash?: string }): Promise<{ apiId: number; apiHash: string }> {
    const apiIdRaw =
      input?.apiId || (await this.settings.get(K.apiId)) || this.config.get('TG_USERBOT_API_ID', { infer: true }) || '';
    const apiHash =
      input?.apiHash ||
      this.decrypt(await this.settings.get(K.apiHash)) ||
      this.config.get('TG_USERBOT_API_HASH', { infer: true }) ||
      '';
    return { apiId: Number(apiIdRaw), apiHash };
  }

  private newClient(session: string, apiId: number, apiHash: string): TelegramClient {
    const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
      connectionRetries: 5,
      proxy: this.proxy,
    });
    try {
      client.setLogLevel('none' as never);
    } catch {
      /* noop */
    }
    return client;
  }

  /** Шаг 1: сохранить реквизиты, отправить код на телефон. */
  async start(input: { apiId: string; apiHash: string; phone: string }): Promise<TgUserbotState> {
    if (!this.enabledCached) return this.getState();
    const phone = input.phone.trim();
    const { apiId, apiHash } = await this.creds(input);
    if (!apiId || !apiHash || !phone) {
      this.status = 'disconnected';
      return { ...this.getState(), message: 'Заполните api_id, api_hash и телефон.' };
    }
    await this.settings.set(K.apiId, String(apiId));
    await this.settings.set(K.apiHash, this.crypto.encryptPii(apiHash));
    await this.settings.set(K.phone, phone);
    try {
      const client = this.newClient('', apiId, apiHash);
      await client.connect();
      const { phoneCodeHash } = await client.sendCode({ apiId, apiHash }, phone);
      this.pending = { client, phone, phoneCodeHash };
      this.status = 'awaiting_code';
    } catch (e) {
      this.logger.error(`sendCode: ${(e as Error).message}`);
      this.status = 'disconnected';
      return { ...this.getState(), message: `Не удалось отправить код: ${(e as Error).message}` };
    }
    return this.getPublicState();
  }

  /** Шаг 2: ввод кода. Возможен переход на шаг 2FA. */
  async submitCode(code: string): Promise<TgUserbotState> {
    if (!this.pending) return { ...this.getState(), message: 'Сессия входа не запущена — начните заново.' };
    const { client, phone, phoneCodeHash } = this.pending;
    try {
      await client.invoke(
        new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code.trim() }),
      );
      return this.finalizeLogin();
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('SESSION_PASSWORD_NEEDED')) {
        this.status = 'awaiting_password';
        return this.getState();
      }
      this.logger.error(`SignIn: ${msg}`);
      return { ...this.getState(), message: `Ошибка кода: ${msg}` };
    }
  }

  /** Шаг 3: облачный пароль (2FA). */
  async submitPassword(password: string): Promise<TgUserbotState> {
    if (!this.pending) return { ...this.getState(), message: 'Сессия входа не запущена — начните заново.' };
    const { client } = this.pending;
    try {
      const pwd = await client.invoke(new Api.account.GetPassword());
      const check = await computeCheck(pwd, password);
      await client.invoke(new Api.auth.CheckPassword({ password: check }));
      return this.finalizeLogin();
    } catch (e) {
      this.logger.error(`CheckPassword: ${(e as Error).message}`);
      return { ...this.getState(), message: `Ошибка пароля: ${(e as Error).message}` };
    }
  }

  /** Отвязать аккаунт и удалить сессию. */
  async logout(): Promise<TgUserbotState> {
    try {
      await this.client?.invoke(new Api.auth.LogOut());
    } catch {
      /* noop */
    }
    await this.client?.disconnect().catch(() => undefined);
    this.client = null;
    this.pending = null;
    this.me = null;
    await this.settings.set(K.session, '');
    this.status = this.enabledCached ? 'disconnected' : 'disabled';
    return this.getState();
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.client || this.status !== 'connected') {
      this.logger.warn('Userbot не подключён — сообщение не отправлено.');
      return;
    }
    try {
      // id пользователя личного чата — в пределах Number.MAX_SAFE_INTEGER.
      await this.client.sendMessage(Number(to), { message: text });
    } catch (e) {
      this.logger.error(`sendMessage: ${(e as Error).message}`);
    }
  }

  /** Подключить сохранённую сессию при старте. */
  private async connectSaved(): Promise<void> {
    const session = this.decrypt(await this.settings.get(K.session));
    if (!session) {
      this.status = 'disconnected';
      return;
    }
    const { apiId, apiHash } = await this.creds();
    if (!apiId || !apiHash) {
      this.status = 'disconnected';
      return;
    }
    try {
      const client = this.newClient(session, apiId, apiHash);
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        this.status = 'disconnected';
        return;
      }
      this.client = client;
      await this.attach(client);
      this.status = 'connected';
      this.logger.log(`Userbot подключён${this.me ? ` как ${this.me}` : ''}.`);
    } catch (e) {
      this.logger.error(`connectSaved: ${(e as Error).message}`);
      this.status = 'disconnected';
    }
  }

  /** Завершить вход: сохранить сессию, подписаться на входящие. */
  private async finalizeLogin(): Promise<TgUserbotState> {
    if (!this.pending) return this.getState();
    const client = this.pending.client;
    this.pending = null;
    this.client = client;
    const session = client.session.save() as unknown as string;
    if (session) await this.settings.set(K.session, this.crypto.encryptPii(session));
    await this.attach(client);
    this.status = 'connected';
    this.logger.log(`Userbot вошёл${this.me ? ` как ${this.me}` : ''}.`);
    return this.getState();
  }

  /** Подписка на входящие + резолв «me». */
  private async attach(client: TelegramClient): Promise<void> {
    try {
      const meUser = (await client.getMe()) as Api.User;
      this.me = meUser.username ? `@${meUser.username}` : (meUser.phone ?? null);
    } catch {
      this.me = null;
    }
    client.addEventHandler((e: NewMessageEvent) => void this.onMessage(e), new NewMessage({}));
  }

  private async onMessage(event: NewMessageEvent): Promise<void> {
    if (!this.handler) return;
    const msg = event.message;
    if (!event.isPrivate || msg.out) return; // только входящие ЛИЧНЫЕ, не наши
    const text = msg.text?.trim();
    const chatId = msg.chatId?.toString();
    if (!text || !chatId) return;
    try {
      await this.handler(chatId, text);
    } catch (e) {
      this.logger.error(`обработка входящего: ${(e as Error).message}`);
    }
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch {
      return '';
    }
  }
}
