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

  /**
   * Загружаем файл по fileUrl на MAX Upload API и возвращаем i.oneme.ru CDN-URL.
   *
   * MAX Bot API принимает вложения только с собственного CDN (i.oneme.ru).
   * При отправке через Umnico → MAX наш api.nomero.online/uploads/... возвращает 403.
   * Поэтому перед sendAttachment через Umnico мы загружаем файл на MAX заранее.
   *
   * Эндпоинт: POST {apiBase}/upload?type=image|video|file
   * Ответ: { payload: { url: "https://i.oneme.ru/..." } }
   */
  async uploadMedia(fileUrl: string, kind: 'IMAGE' | 'VIDEO' | 'FILE'): Promise<string | null> {
    const { apiBase, botToken } = await this.cfg.resolve();
    if (!botToken) {
      this.logger.warn('Токен MAX-бота не задан — uploadMedia пропущен.');
      return null;
    }

    // Скачиваем файл с нашего сервера
    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) }).catch((err: unknown) => {
      this.logger.warn(`MAX upload: не удалось скачать файл: ${(err as Error).message}`);
      return null;
    });
    if (!fileRes?.ok) {
      this.logger.warn(`MAX upload: ответ сервера файлов ${fileRes?.status ?? '—'} для ${fileUrl}`);
      return null;
    }

    const contentType = fileRes.headers.get('content-type') ?? 'application/octet-stream';
    const arrayBuffer = await fileRes.arrayBuffer().catch(() => null);
    if (!arrayBuffer) {
      this.logger.warn('MAX upload: не удалось прочитать тело файла');
      return null;
    }

    const type = kind === 'IMAGE' ? 'image' : kind === 'VIDEO' ? 'video' : 'file';
    const ext = fileUrl.split('?')[0]?.split('.').pop() ?? 'bin';
    const filename = `upload.${ext}`;

    const form = new FormData();
    form.append('data', new Blob([arrayBuffer], { type: contentType }), filename);

    const uploadUrl = `${apiBase}/upload?type=${type}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: botToken },
      body: form,
      signal: AbortSignal.timeout(60000),
    }).catch((err: unknown) => {
      this.logger.error(`MAX upload сеть: ${(err as Error).message}`);
      return null;
    });

    const rawText = uploadRes ? await uploadRes.text().catch(() => '') : '';
    if (!uploadRes?.ok) {
      this.logger.error(`MAX upload ${uploadRes?.status ?? '—'}: ${rawText.slice(0, 300)}`);
      return null;
    }

    let parsed: { payload?: { url?: string } };
    try {
      parsed = JSON.parse(rawText) as { payload?: { url?: string } };
    } catch {
      this.logger.warn('MAX upload: не JSON в ответе: ' + rawText.slice(0, 200));
      return null;
    }

    const cdnUrl = parsed?.payload?.url ?? null;
    if (cdnUrl) {
      this.logger.log(`MAX upload ok → ${cdnUrl.slice(0, 80)}`);
    } else {
      this.logger.warn('MAX upload: нет payload.url в ответе: ' + rawText.slice(0, 200));
    }
    return cdnUrl;
  }
}
