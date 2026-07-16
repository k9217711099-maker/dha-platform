/**
 * Порт отправки сообщений в MAX-мессенджер (бот). Реализация — HttpMaxAdapter
 * (реальный Bot API) или mock (лог). По аналогии с TelegramPort.
 */
export abstract class MaxPort {
  /** Отправить текст в чат MAX по chat_id. */
  abstract sendMessage(chatId: number | string, text: string): Promise<void>;
}
