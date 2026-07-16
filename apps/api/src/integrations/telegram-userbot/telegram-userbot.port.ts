/**
 * Порт отправки сообщений от ЛИЧНОГО Telegram-аккаунта (userbot, GramJS/MTProto).
 * Отличается от TelegramPort (бот) — это Telegram Direct. Реализация —
 * TelegramUserbotService.
 */
export abstract class TelegramUserbotPort {
  /** Отправить текст в личный чат по id пользователя. */
  abstract sendMessage(to: string, text: string): Promise<void>;
}
