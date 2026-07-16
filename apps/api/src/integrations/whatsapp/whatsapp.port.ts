/**
 * Порт отправки сообщений в WhatsApp. Реализация — WhatsAppService (Baileys,
 * неофициальное подключение личного/бизнес-номера). По аналогии с TelegramPort.
 */
export abstract class WhatsAppPort {
  /** Отправить текст в WhatsApp по jid (напр. 79990000000@s.whatsapp.net). */
  abstract sendMessage(to: string, text: string): Promise<void>;
}
