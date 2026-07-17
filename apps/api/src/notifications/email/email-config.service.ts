import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для SMTP (пароль — зашифрован). */
const K = {
  host: 'notify.smtp.host',
  port: 'notify.smtp.port',
  secure: 'notify.smtp.secure',
  user: 'notify.smtp.user',
  pass: 'notify.smtp.pass',
  from: 'notify.smtp.from',
} as const;

export interface SmtpCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface SmtpPublicConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  passSet: boolean;
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
    const [host, port, secure, user, encPass, from] = await Promise.all([
      this.settings.get(K.host),
      this.settings.get(K.port),
      this.settings.get(K.secure),
      this.settings.get(K.user),
      this.settings.get(K.pass),
      this.settings.get(K.from),
    ]);
    return {
      host: host || this.config.get('SMTP_HOST', { infer: true }) || '',
      port: port ? Number(port) : this.config.get('SMTP_PORT', { infer: true }),
      secure: secure != null ? secure === 'true' : this.config.get('SMTP_SECURE', { infer: true }),
      user: user || this.config.get('SMTP_USER', { infer: true }) || '',
      pass: this.decrypt(encPass) || this.config.get('SMTP_PASS', { infer: true }) || '',
      from: from || this.config.get('SMTP_FROM', { infer: true }),
    };
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
  }

  /** Проверка подключения: verify() транспорта SMTP. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const c = await this.resolve();
    if (!c.host) return { ok: false, message: 'Не задан SMTP-хост.' };
    try {
      const tx = nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      });
      await tx.verify();
      return { ok: true, message: `Подключение успешно: ${c.host}:${c.port}` };
    } catch (e) {
      return { ok: false, message: `Не удалось подключиться: ${(e as Error).message}` };
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
