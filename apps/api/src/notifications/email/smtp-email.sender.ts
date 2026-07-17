import { Injectable, Logger } from '@nestjs/common';
import { type Transporter } from 'nodemailer';
import { EmailSender, type EmailMessage } from './email.port.js';
import { EmailConfigService, type SmtpCredentials } from './email-config.service.js';

/**
 * Отправка email через SMTP (nodemailer). Реквизиты берутся динамически из
 * EmailConfigService (админка/env), включая прокси. Если SMTP не настроен (нет
 * host) — фолбэк в лог (dev-режим). Транспорт кэшируется и пересоздаётся при
 * смене реквизитов. По аналогии с рантайм-диспетчером Telegram.
 */
@Injectable()
export class SmtpEmailSender extends EmailSender {
  private readonly logger = new Logger('SmtpEmailSender');
  private cached: { key: string; tx: Transporter } | null = null;

  constructor(private readonly cfg: EmailConfigService) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const c = await this.cfg.resolve();
    if (!c.host) {
      // Нет реквизитов SMTP — не роняем сценарий, просто логируем (dev).
      this.logger.log(`EMAIL(dev) → ${message.to} | ${message.subject}: ${message.text}`);
      return;
    }
    await this.transport(c).sendMail({
      from: c.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    this.logger.log(`EMAIL → ${message.to} | ${message.subject}`);
  }

  private transport(c: SmtpCredentials): Transporter {
    const key = `${c.host}:${c.port}:${c.secure}:${c.user}:${c.proxy}`;
    if (this.cached && this.cached.key === key) return this.cached.tx;
    const tx = this.cfg.buildTransport(c);
    this.cached = { key, tx };
    return tx;
  }
}
