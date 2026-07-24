import { Injectable, Logger } from '@nestjs/common';
import { MaxPort, type MaxOutgoingMedia } from './max.port.js';
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

  /**
   * Медиа по ссылке через MAX Bot API. Формат: `attachments:[{type, payload:{url}}]`.
   * type: image/video/file (по аналогии с входящим вебхуком MAX).
   * Подпись — в поле `text` рядом с вложением (MAX совмещает в одном сообщении).
   * При ошибке API бросает исключение — оператор-инбокс перехватит и пошлёт ссылку.
   */
  async sendMedia(chatId: number | string, media: MaxOutgoingMedia): Promise<void> {
    const { apiBase, botToken } = await this.cfg.resolve();
    if (!botToken) {
      this.logger.warn('Токен MAX-бота не задан — медиа не отправлено.');
      return;
    }
    const type = media.kind === 'IMAGE' ? 'image' : media.kind === 'VIDEO' ? 'video' : 'file';
    const body: Record<string, unknown> = {
      attachments: [{ type, payload: { url: media.url } }],
    };
    // Подпись: берём caption; для файлов без подписи — имя файла, чтобы гость понял что пришло.
    const text = media.caption?.trim() || (media.kind === 'FILE' ? media.name : '');
    if (text) body.text = text;

    const url = `${apiBase}/messages?chat_id=${encodeURIComponent(String(chatId))}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: botToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    }).catch((err: unknown) => {
      this.logger.error(`MAX sendMedia сеть: ${(err as Error).message}`);
      return null;
    });
    const detail = res ? await res.text().catch(() => '') : 'network';
    if (!res || !res.ok) {
      this.logger.error(`MAX sendMedia ${res?.status ?? '—'} (${type}): ${String(detail).slice(0, 300)}`);
      throw new Error(`MAX sendMedia ${res?.status ?? 'network'}: ${String(detail).slice(0, 200)}`);
    }
    this.logger.log(`MAX sendMedia ok (${type})`);
  }
}
