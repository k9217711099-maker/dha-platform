/** Порт push-уведомлений (APNs/FCM/RuStore). Реализация по умолчанию — MockPushSender. */
export abstract class PushSender {
  abstract send(token: string, title: string, body: string): Promise<void>;
}
