import { Injectable, Logger } from '@nestjs/common';
import { MaxPort } from './max.port.js';

/** In-memory заглушка MAX для разработки/тестов (пишет в лог). */
@Injectable()
export class MockMaxAdapter extends MaxPort {
  private readonly logger = new Logger('MockMax');

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    this.logger.log(`→ ${chatId}: ${text.slice(0, 120)}`);
  }
}
