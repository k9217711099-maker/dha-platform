import { Injectable, Logger } from '@nestjs/common';
import { TelegramPort } from './telegram.port.js';
import { TelegramConfigService } from './telegram-config.service.js';

/** Отправка через Telegram Bot API (POST /bot<token>/sendMessage). */
@Injectable()
export class HttpTelegramAdapter extends TelegramPort {
  private readonly logger = new Logger('Telegram');

  constructor(private readonly cfg: TelegramConfigService) {
    super();
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    const { apiBase, botToken } = await this.cfg.resolve();
    if (!botToken) {
      this.logger.warn('Токен Telegram-бота не задан (админка/ env) — сообщение не отправлено.');
      return;
    }
    const res = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    }).catch((err: unknown) => {
      this.logger.error(`Telegram sendMessage сеть: ${(err as Error).message}`);
      return null;
    });
    if (res && !res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Telegram sendMessage ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}
