/** Порт отправки SMS. Реализации: DevSmsSender (лог), SmscSmsSender (SMSC.ru). */
export abstract class SmsSender {
  abstract send(to: string, message: string): Promise<void>;
}
