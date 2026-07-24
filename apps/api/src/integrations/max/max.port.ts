/**
 * Медиа для отправки в MAX (фото/видео/файл по прямой ссылке). По аналогии с OutgoingMedia
 * из TelegramPort — те же поля, чтобы одна структура работала везде.
 */
export interface MaxOutgoingMedia {
  url: string;
  kind: 'IMAGE' | 'VIDEO' | 'FILE';
  name: string;
  caption?: string;
}

/**
 * Порт отправки сообщений в MAX-мессенджер (бот). Реализация — HttpMaxAdapter
 * (реальный Bot API) или mock (лог). По аналогии с TelegramPort.
 */
export abstract class MaxPort {
  /** Отправить текст в чат MAX по chat_id. */
  abstract sendMessage(chatId: number | string, text: string): Promise<void>;
  /** Отправить фото/видео/файл по прямой ссылке. При ошибке бросает — оператор-инбокс фолбэкнет ссылкой. */
  abstract sendMedia(chatId: number | string, media: MaxOutgoingMedia): Promise<void>;
  /**
   * Загрузить файл на MAX CDN (Upload API) и вернуть i.oneme.ru URL.
   * Нужно перед отправкой через Umnico: MAX Bot API принимает только файлы со своего CDN —
   * внешние URL (напр. api.nomero.online) отклоняет 403. При сбое возвращает null.
   */
  abstract uploadMedia(fileUrl: string, kind: 'IMAGE' | 'VIDEO' | 'FILE'): Promise<string | null>;
}
