import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PaymentGatewayPort } from './payment-gateway.port.js';
import { parseYooKassaWebhook } from './webhook.parser.js';
import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from './yookassa.types.js';

interface MockPayment {
  status: string;
  amountRub: number;
  capture: boolean;
}

/**
 * In-memory платёжный шлюз для разработки/тестов. Реальное списание не выполняется;
 * подтверждение оплаты эмулируется на уровне сервиса (simulateSuccess).
 */
@Injectable()
export class MockYooKassaAdapter extends PaymentGatewayPort {
  private readonly payments = new Map<string, MockPayment>();

  async createPayment(req: CreatePaymentRequest): Promise<PaymentResult> {
    const gatewayPaymentId = `mock-pay-${randomUUID()}`;
    this.payments.set(gatewayPaymentId, {
      status: req.capture ? 'pending' : 'waiting_for_capture',
      amountRub: req.amountRub,
      capture: req.capture,
    });
    // В mock confirmationUrl нет — фронт ведёт на внутреннюю демо-страницу оплаты.
    return { gatewayPaymentId, status: 'pending', confirmationUrl: null };
  }

  async capturePayment(gatewayPaymentId: string): Promise<PaymentResult> {
    const p = this.payments.get(gatewayPaymentId);
    if (p) p.status = 'succeeded';
    return { gatewayPaymentId, status: 'succeeded', confirmationUrl: null };
  }

  async cancelPayment(gatewayPaymentId: string): Promise<void> {
    const p = this.payments.get(gatewayPaymentId);
    if (p) p.status = 'canceled';
  }

  async createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult> {
    const p = this.payments.get(gatewayPaymentId);
    if (p) p.status = 'refunded';
    return { refundId: `mock-refund-${randomUUID()}`, status: 'succeeded' };
  }

  async getPayment(gatewayPaymentId: string): Promise<{ status: string }> {
    return { status: this.payments.get(gatewayPaymentId)?.status ?? 'unknown' };
  }

  parseWebhook(payload: unknown): WebhookEvent {
    return parseYooKassaWebhook(payload);
  }

  /** Тестовый помощник: пометить платёж оплаченным. */
  markSucceeded(gatewayPaymentId: string): void {
    const p = this.payments.get(gatewayPaymentId);
    if (p) p.status = 'succeeded';
  }
}
