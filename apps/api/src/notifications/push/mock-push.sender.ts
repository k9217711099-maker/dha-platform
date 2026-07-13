import { Injectable, Logger } from '@nestjs/common';
import { PushSender } from './push.port.js';

/** Заглушка push для разработки: «отправленное» уведомление пишется в лог. */
@Injectable()
export class MockPushSender extends PushSender {
  private readonly logger = new Logger('MockPushSender');

  async send(token: string, title: string, body: string): Promise<void> {
    this.logger.log(`PUSH → ${token.slice(0, 8)}…: ${title} — ${body}`);
  }
}
