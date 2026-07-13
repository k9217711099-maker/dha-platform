/**
 * Порт переписки с гостем внутри OTA (CHECK-IN-TZ §3.2/§5.1, канал `ota_messaging`).
 *
 * ШОВ НА БУДУЩЕЕ: какие OTA дают API переписки — открытый вопрос ТЗ §16.3
 * (Booking Messaging API, Островок и т.п.). Сейчас единственная реализация — noop
 * (лог + журнал); когда доступ к API появится, пишется только адаптер, вызовы
 * оркестратора не меняются.
 */
export interface OtaMessageParams {
  bookingId: string;
  /** Источник брони (sourceName из Channel Manager) — выбор OTA-адаптера. */
  sourceName: string | null;
  /** Внешний ID объекта/брони на стороне OTA. */
  externalObjectId: string | null;
  text: string;
}

export abstract class OtaMessagingPort {
  /** Отправить сообщение в тред OTA. false — канал недоступен (нет API/треда). */
  abstract send(params: OtaMessageParams): Promise<boolean>;
}
