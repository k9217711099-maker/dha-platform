import { Injectable, Logger } from '@nestjs/common';
import { EmailSender, type EmailMessage } from './email.port.js';

/** Заглушка для разработки: письмо пишется в лог. */
@Injectable()
export class DevEmailSender extends EmailSender {
  private readonly logger = new Logger('DevEmailSender');

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`EMAIL → ${message.to} | ${message.subject}: ${message.text}`);
  }
}
