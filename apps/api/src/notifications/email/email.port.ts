export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Порт отправки email. Реализация по умолчанию — DevEmailSender (лог). */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}
