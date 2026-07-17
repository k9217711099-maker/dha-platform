import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import * as socks from 'socks';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для SMTP (пароль/прокси — зашифрованы). */
const K = {
  host: 'notify.smtp.host',
  port: 'notify.smtp.port',
  secure: 'notify.smtp.secure',
  user: 'notify.smtp.user',
  pass: 'notify.smtp.pass',
  from: 'notify.smtp.from',
  proxy: 'notify.smtp.proxy',
} as const;

export interface SmtpCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** SOCKS5/HTTP-прокси для обхода блокировки исходящих SMTP-портов (пусто — напрямую). */
  proxy: string;
}

export interface SmtpPublicConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  passSet: boolean;
  /** Прокси задан (сам URL с паролем наружу не отдаём). */
  proxySet: boolean;
  /** Достаточно реквизитов (задан host) — письма пойдут через SMTP. */
  configured: boolean;
}

export interface SmtpConnectionInput {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  proxy?: string;
}

/**
 * Конфигурация SMTP для реальной отправки email. Реквизиты вводятся в админке и
 * хранятся в Setting (пароль шифруется AES-256-GCM), env — запасной вариант.
 * SmtpEmailSender читает их динамически — ввод реквизитов включает почту без
 * правки .env и перезапуска. По аналогии с TelegramConfigService.
 */
@Injectable()
export class EmailConfigService {
  private readonly logger = new Logger(EmailConfigService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async resolve(): Promise<SmtpCredentials> {
    const [host, port, secure, user, encPass, from, encProxy] = await Promise.all([
      this.settings.get(K.host),
      this.settings.get(K.port),
      this.settings.get(K.secure),
      this.settings.get(K.user),
      this.settings.get(K.pass),
      this.settings.get(K.from),
      this.settings.get(K.proxy),
    ]);
    return {
      host: host || this.config.get('SMTP_HOST', { infer: true }) || '',
      port: port ? Number(port) : this.config.get('SMTP_PORT', { infer: true }),
      secure: secure != null ? secure === 'true' : this.config.get('SMTP_SECURE', { infer: true }),
      user: user || this.config.get('SMTP_USER', { infer: true }) || '',
      pass: this.decrypt(encPass) || this.config.get('SMTP_PASS', { infer: true }) || '',
      from: from || this.config.get('SMTP_FROM', { infer: true }),
      proxy: this.decrypt(encProxy) || this.config.get('SMTP_PROXY_URL', { infer: true }) || '',
    };
  }

  /**
   * Транспорт nodemailer с таймаутами и (при наличии) прокси. SOCKS5-прокси
   * позволяет отправлять почту, даже если хостинг блокирует исходящие 465/587 —
   * соединение идёт через прокси. Для socks нужен модуль `socks`.
   */
  buildTransport(c: SmtpCredentials): Transporter {
    const base = {
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
    };
    // `proxy` поддерживается nodemailer в рантайме, но не типизирован в @types —
    // добавляем через приведение к базовому типу.
    const opts = c.proxy ? ({ ...base, proxy: c.proxy } as typeof base) : base;
    const tx = nodemailer.createTransport(opts);
    if (c.proxy && c.proxy.startsWith('socks')) tx.set('proxy_socks_module', socks);
    return tx;
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.resolve()).host;
  }

  async getPublicConfig(): Promise<SmtpPublicConfig> {
    const c = await this.resolve();
    return {
      host: c.host,
      port: c.port,
      secure: c.secure,
      user: c.user,
      from: c.from,
      passSet: !!c.pass,
      proxySet: !!c.proxy,
      configured: !!c.host,
    };
  }

  async save(input: SmtpConnectionInput): Promise<void> {
    if (input.host !== undefined) await this.settings.set(K.host, input.host.trim());
    if (input.port !== undefined) await this.settings.set(K.port, String(input.port));
    if (input.secure !== undefined) await this.settings.set(K.secure, input.secure ? 'true' : 'false');
    if (input.user !== undefined) await this.settings.set(K.user, input.user.trim());
    if (input.pass) await this.settings.set(K.pass, this.crypto.encryptPii(input.pass));
    if (input.from !== undefined) await this.settings.set(K.from, input.from.trim());
    if (input.proxy !== undefined) {
      const p = input.proxy.trim();
      await this.settings.set(K.proxy, p ? this.crypto.encryptPii(p) : '');
    }
  }

  /** Проверка подключения: verify() транспорта SMTP. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const c = await this.resolve();
    if (!c.host) return { ok: false, message: 'Не задан SMTP-хост.' };
    try {
      await this.buildTransport(c).verify();
      return { ok: true, message: `Подключение успешно: ${c.host}:${c.port}${c.proxy ? ' (через прокси)' : ''}` };
    } catch (e) {
      const m = (e as Error).message || '';
      const hint = /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(m)
        ? c.proxy
          ? ' — прокси не смог соединиться с SMTP (проверьте адрес прокси и хост/порт SMTP).'
          : ' — сервер не смог подключиться к SMTP: порт, скорее всего, закрыт хостингом. Укажите SOCKS5-прокси в поле ниже.'
        : /auth|535|credential|password|login/i.test(m)
          ? ' — логин или пароль отклонены (нужен «пароль приложения», не основной).'
          : '';
      return { ok: false, message: `Не удалось подключиться: ${m}${hint}` };
    }
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать пароль SMTP: ${(e as Error).message}`);
      return '';
    }
  }
}
