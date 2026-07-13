import { Injectable, Logger } from '@nestjs/common';
import { TelegramPort } from './telegram.port.js';

/** In-memory заглушка Telegram для разработки/тестов (пишет в лог). */
@Injectable()
export class MockTelegramAdapter extends TelegramPort {
  private readonly logger = new Logger('MockTelegram');

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    this.logger.log(`→ ${chatId}: ${text.slice(0, 120)}`);
  }
}
