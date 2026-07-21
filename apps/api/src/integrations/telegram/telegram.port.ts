/** Медиа для отправки в канал (фото/видео/файл по прямой ссылке). */
export interface OutgoingMedia {
  url: string;
  kind: 'IMAGE' | 'VIDEO' | 'FILE';
  name: string;
  caption?: string;
}

/** Контракт отправки сообщений в Telegram (Bot API sendMessage/sendPhoto/…). */
export abstract class TelegramPort {
  abstract sendMessage(chatId: number | string, text: string): Promise<void>;
  /** Отправить медиа (фото/видео/документ) по ссылке. */
  abstract sendMedia(chatId: number | string, media: OutgoingMedia): Promise<void>;
}
