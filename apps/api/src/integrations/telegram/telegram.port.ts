/** Контракт отправки сообщений в Telegram (Bot API sendMessage). */
export abstract class TelegramPort {
  abstract sendMessage(chatId: number | string, text: string): Promise<void>;
}
