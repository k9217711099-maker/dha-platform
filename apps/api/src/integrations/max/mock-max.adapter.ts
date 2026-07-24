import { Injectable, Logger } from '@nestjs/common';
import { MaxPort, type MaxOutgoingMedia } from './max.port.js';

/** In-memory заглушка MAX для разработки/тестов (пишет в лог). */
@Injectable()
export class MockMaxAdapter extends MaxPort {
  private readonly logger = new Logger('MockMax');

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    this.logger.log(`→ ${chatId}: ${text.slice(0, 120)}`);
  }

  async sendMedia(chatId: number | string, media: MaxOutgoingMedia): Promise<void> {
    this.logger.log(`→ ${chatId} [${media.kind}]: ${media.url.slice(0, 100)}`);
  }
}
