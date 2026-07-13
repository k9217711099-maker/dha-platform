import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from './yookassa.types.js';

/**
 * Порт платёжного шлюза. Бизнес-логика зависит только от него; реализации —
 * MockYooKassaAdapter (разработка) и HttpYooKassaAdapter (реальный YooKassa).
 */
export abstract class PaymentGatewayPort {
  /** Создать платёж (с чеком 54-ФЗ). Возвращает URL оплаты для redirect. */
  abstract createPayment(req: CreatePaymentRequest): Promise<PaymentResult>;

  /** Подтвердить захолдированный платёж (двухстадийный). */
  abstract capturePayment(gatewayPaymentId: string, amountRub?: number): Promise<PaymentResult>;

  /** Отменить платёж/холд. */
  abstract cancelPayment(gatewayPaymentId: string): Promise<void>;

  /** Возврат средств. */
  abstract createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult>;

  /** Текущий статус платежа. */
  abstract getPayment(gatewayPaymentId: string): Promise<{ status: string }>;

  /** Разобрать тело webhook-уведомления шлюза. */
  abstract parseWebhook(payload: unknown): WebhookEvent;
}
