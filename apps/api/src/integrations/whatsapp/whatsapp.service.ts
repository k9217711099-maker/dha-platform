import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Agent } from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import QRCode from 'qrcode';
import * as baileys from '@whiskeysockets/baileys';
import type { WASocket, WAMessage, ConnectionState } from '@whiskeysockets/baileys';
import type { Env } from '../../config/env.schema.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { WhatsAppPort } from './whatsapp.port.js';

/** Ключ Setting тумблера канала (единый формат с ChannelToggleService). */
const ENABLED_KEY = 'ai.channel.whatsapp.enabled';

const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, Browsers } = baileys;

/** Статус подключения WhatsApp для админки. */
export type WaStatus = 'disabled' | 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WaState {
  status: WaStatus;
  /** QR как data:image/png;base64 — показываем в админке, пока status='qr'. */
  qr: string | null;
  /** Номер, к которому привязан бот (когда подключено). */
  me: string | null;
  message: string;
}

/** Пустой логгер для Baileys (иначе шумит в stdout). */
function silentLogger(): unknown {
  const noop = (): void => undefined;
  const l: Record<string, unknown> = {
    level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
  };
  l.child = () => l;
  return l;
}

/** http.Agent для WebSocket Baileys через прокси (WhatsApp заблокирован с РФ). */
function wsProxyAgent(url?: string): Agent | undefined {
  if (!url) return undefined;
  return (url.startsWith('socks')
    ? new SocksProxyAgent(url)
    : new HttpsProxyAgent(url)) as unknown as Agent;
}

/**
 * WhatsApp через Baileys (неофициально): вход по QR личным/бизнес-номером, сессия
 * в файлах WA_AUTH_DIR (вне репозитория). Сокет живёт в процессе API, авто-
 * переподключается; исходящие идут через MESSENGER_PROXY_URL. Пейринг (показ QR)
 * запускается из админки. Входящие — через registerHandler (WhatsAppAgentService).
 *
 * ⚠️ Неофициальный клиент: WhatsApp может заблокировать номер за автоматизацию —
 * подключайте отдельный номер, не основной рабочий.
 */
@Injectable()
export class WhatsAppService extends WhatsAppPort implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsApp');
  private sock: WASocket | null = null;
  private state: WaStatus = 'disconnected';
  private qr: string | null = null;
  private me: string | null = null;
  private stopped = false;
  private connecting = false;
  private enabledCached = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handler: ((from: string, text: string) => Promise<void>) | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  /** Тумблер (Setting) с фолбэком на legacy-env WA_ENABLED. */
  private async loadEnabled(): Promise<boolean> {
    const v = await this.settings.get(ENABLED_KEY);
    this.enabledCached =
      v === null || v === undefined || v === ''
        ? this.config.get('WA_ENABLED', { infer: true })
        : v === 'true';
    return this.enabledCached;
  }
  private get authDir(): string {
    return resolve(this.config.get('WA_AUTH_DIR', { infer: true }));
  }

  async onModuleInit(): Promise<void> {
    if (!(await this.loadEnabled())) {
      this.state = 'disabled';
      return;
    }
    // Есть сохранённая сессия — переподключаемся при старте.
    if (existsSync(resolve(this.authDir, 'creds.json'))) void this.connect();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.sock?.end(undefined);
    } catch {
      /* noop */
    }
  }

  /** Регистрируется WhatsAppAgentService — маршрут входящих в гостевой агент. */
  registerHandler(fn: (from: string, text: string) => Promise<void>): void {
    this.handler = fn;
  }

  getState(): WaState {
    const msg: Record<WaStatus, string> = {
      disabled: 'Канал выключен — включите переключателем, затем нажмите «Подключить».',
      disconnected: 'Не подключено. Нажмите «Подключить» и отсканируйте QR в WhatsApp.',
      connecting: 'Подключение…',
      qr: 'Отсканируйте QR-код в приложении WhatsApp: Настройки → Связанные устройства.',
      connected: `Подключено${this.me ? ` как ${this.me}` : ''}.`,
    };
    return { status: this.state, qr: this.qr, me: this.me, message: msg[this.state] };
  }

  /** Включить/выключить канал (тумблер из админки). */
  async setEnabled(on: boolean): Promise<WaState> {
    await this.settings.set(ENABLED_KEY, on ? 'true' : 'false');
    this.enabledCached = on;
    if (!on) {
      this.stopped = true;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      try {
        this.sock?.end(undefined);
      } catch {
        /* noop */
      }
      this.sock = null;
      this.qr = null;
      this.me = null;
      this.state = 'disabled';
    } else {
      this.stopped = false;
      this.state = 'disconnected';
      // Есть сессия — сразу переподключаемся; иначе ждём «Подключить» (QR).
      if (existsSync(resolve(this.authDir, 'creds.json'))) void this.connect();
    }
    return this.getState();
  }

  /** Запуск пейринга/подключения из админки. */
  async start(): Promise<WaState> {
    if (!this.enabledCached) return this.getState();
    if (this.state === 'connected' || this.connecting) return this.getState();
    // QR уже показан и сокет жив — не плодим второй сокет (двойной вход = конфликт,
    // WhatsApp сбрасывает сессию). QR обновляется сам через connection.update.
    if (this.state === 'qr' && this.sock) return this.getState();
    this.stopped = false;
    await this.connect();
    return this.getState();
  }

  /** Переподключение с очисткой предыдущего таймера (без наложения). */
  private scheduleReconnect(delayMs: number): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
  }

  /** Отвязать номер и удалить сессию. */
  async logout(): Promise<WaState> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      await this.sock?.logout();
    } catch {
      /* уже отвалилось */
    }
    this.sock = null;
    this.clearSession();
    this.state = this.enabledCached ? 'disconnected' : 'disabled';
    this.qr = null;
    this.me = null;
    return this.getState();
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.sock || this.state !== 'connected') {
      this.logger.warn('WhatsApp не подключён — сообщение не отправлено.');
      return;
    }
    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    try {
      await this.sock.sendMessage(jid, { text });
    } catch (e) {
      this.logger.error(`WhatsApp sendMessage: ${(e as Error).message}`);
    }
  }

  private async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    this.state = 'connecting';
    // Гасим предыдущий сокет, если остался — иначе два соединения дают конфликт.
    try {
      this.sock?.end(undefined);
    } catch {
      /* noop */
    }
    this.sock = null;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      // WA_PROXY_URL (можно SOCKS5) приоритетнее — WS надёжнее через SOCKS, чем через HTTP-прокси.
      const proxyUrl =
        this.config.get('WA_PROXY_URL', { infer: true }) ||
        this.config.get('MESSENGER_PROXY_URL', { infer: true });
      const agent = wsProxyAgent(proxyUrl);
      const sock = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('D H&A'),
        logger: silentLogger() as never,
        agent,
        fetchAgent: agent,
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      this.sock = sock;
      sock.ev.on('creds.update', () => void saveCreds());
      sock.ev.on('connection.update', (u) => void this.onConnectionUpdate(u));
      sock.ev.on('messages.upsert', (m) => void this.onMessages(m.messages, m.type));
    } catch (e) {
      this.logger.error(`WhatsApp connect: ${(e as Error).message}`);
      this.state = 'disconnected';
    } finally {
      this.connecting = false;
    }
  }

  private async onConnectionUpdate(u: Partial<ConnectionState>): Promise<void> {
    if (u.qr) {
      this.qr = await QRCode.toDataURL(u.qr).catch(() => null);
      this.state = 'qr';
      this.logger.log('WhatsApp: получен QR — ожидаем сканирования.');
    }
    if (u.connection === 'open') {
      this.state = 'connected';
      this.qr = null;
      this.me = this.sock?.user?.id?.split(':')[0]?.replace(/@.*/, '') ?? null;
      this.logger.log(`WhatsApp подключён${this.me ? ` как ${this.me}` : ''}.`);
    }
    if (u.connection === 'close') {
      const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      // 515 restartRequired — штатный разрыв сразу после сканирования QR: нужно
      // быстро переподключиться на сохранённой сессии (это НЕ ошибка пейринга).
      const restartRequired = code === DisconnectReason.restartRequired;
      this.sock = null;
      if (loggedOut) {
        this.clearSession();
        this.state = 'disconnected';
        this.me = null;
        this.logger.warn('WhatsApp: сессия завершена (logout) — нужен повторный QR.');
        return;
      }
      if (!this.stopped) {
        this.state = 'connecting';
        this.scheduleReconnect(restartRequired ? 500 : 3_000); // после пейринга — почти сразу
      } else {
        this.state = 'disconnected';
      }
    }
  }

  private async onMessages(messages: WAMessage[], type: string): Promise<void> {
    if (type !== 'notify' || !this.handler) return;
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      if (!from || msg.key.fromMe) continue;
      if (from.endsWith('@g.us') || from === 'status@broadcast') continue; // группы/статусы — не обрабатываем
      const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
      if (!text) continue;
      try {
        await this.handler(from, text.trim());
      } catch (e) {
        this.logger.error(`WhatsApp обработка входящего: ${(e as Error).message}`);
      }
    }
  }

  private clearSession(): void {
    try {
      rmSync(this.authDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
}
