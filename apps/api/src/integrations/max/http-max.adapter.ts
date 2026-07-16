import { Injectable, Logger } from '@nestjs/common';
import { MaxPort } from './max.port.js';
import { MaxConfigService } from './max-config.service.js';

/**
 * Отправка через MAX Bot API: POST /messages?chat_id=<id> с телом { text } и
 * заголовком Authorization: <token>. MAX доступен с РФ-сервера напрямую.
 */
@Injectable()
export class HttpMaxAdapter extends MaxPort {
  private readonly logger = new Logger('Max');

  constructor(private readonly cfg: MaxConfigService) {
    super();
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    const { apiBase, botToken } = await this.cfg.resolve();
    if (!botToken) {
      this.logger.warn('Токен MAX-бота не задан (админка/env) — сообщение не отправлено.');
      return;
    }
    const url = `${apiBase}/messages?chat_id=${encodeURIComponent(String(chatId))}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: botToken },
      body: JSON.stringify({ text }),
    }).catch((err: unknown) => {
      this.logger.error(`MAX sendMessage сеть: ${(err as Error).message}`);
      return null;
    });
    if (res && !res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`MAX sendMessage ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}
