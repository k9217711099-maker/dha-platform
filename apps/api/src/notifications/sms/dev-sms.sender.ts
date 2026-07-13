import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from './sms.port.js';

/** Заглушка для разработки: «отправленное» SMS пишется в лог. */
@Injectable()
export class DevSmsSender extends SmsSender {
  private readonly logger = new Logger('DevSmsSender');

  async send(to: string, message: string): Promise<void> {
    this.logger.log(`SMS → ${to}: ${message}`);
  }
}
