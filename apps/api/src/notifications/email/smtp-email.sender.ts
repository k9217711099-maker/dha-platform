import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.schema.js';
import { EmailSender, type EmailMessage } from './email.port.js';

/**
 * Реальная отправка email через SMTP (nodemailer). Включается, когда задан
 * SMTP_HOST; иначе в модуле выбирается DevEmailSender (лог). Транспорт ленивый —
 * создаётся при первой отправке.
 */
@Injectable()
export class SmtpEmailSender extends EmailSender {
  private readonly logger = new Logger('SmtpEmailSender');
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  private get from(): string {
    return this.config.get('SMTP_FROM', { infer: true });
  }

  private tx(): Transporter {
    if (this.transporter) return this.transporter;
    const user = this.config.get('SMTP_USER', { infer: true });
    const pass = this.config.get('SMTP_PASS', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      auth: user ? { user, pass } : undefined,
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.tx().sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    this.logger.log(`EMAIL → ${message.to} | ${message.subject}`);
  }
}
