import { Injectable } from '@nestjs/common';
import { PaymentGatewayPort } from './payment-gateway.port.js';
import { MockYooKassaAdapter } from './mock-yookassa.adapter.js';
import { HttpYooKassaAdapter } from './http-yookassa.adapter.js';
import { HttpBspbAdapter } from '../bspb/http-bspb.adapter.js';
import { HttpPaykeeperAdapter } from '../paykeeper/http-paykeeper.adapter.js';
import { PaymentProviderService } from './payment-provider.service.js';
import type { PaymentProvider } from './payment-provider.service.js';
import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from './yookassa.types.js';

/**
 * Диспетчер платёжного шлюза: на каждый вызов определяет активный эквайер
 * (PaymentProviderService: админка → Setting, env как запас) и делегирует нужному
 * адаптеру. Благодаря этому смена активного эквайринга в UI работает без правки
 * .env и перезапуска API.
 */
@Injectable()
export class PaymentGatewayDispatcher extends PaymentGatewayPort {
  constructor(
    private readonly providers: PaymentProviderService,
    private readonly mock: MockYooKassaAdapter,
    private readonly yookassa: HttpYooKassaAdapter,
    private readonly bspb: HttpBspbAdapter,
    private readonly paykeeper: HttpPaykeeperAdapter,
  ) {
    super();
    // Прогреваем кэш активного эквайера для синхронного parseWebhook (webhook
    // может прийти раньше первого создания платежа в этом процессе).
    void this.providers.resolve().then((p) => { this.cachedProvider = p; }).catch(() => undefined);
  }

  /** Последний вычисленный активный эквайер — для синхронного parseWebhook. */
  private cachedProvider: PaymentProvider = 'mock';

  private byProvider(p: PaymentProvider): PaymentGatewayPort {
    switch (p) {
      case 'yookassa': return this.yookassa;
      case 'bspb': return this.bspb;
      case 'paykeeper': return this.paykeeper;
      default: return this.mock;
    }
  }

  private async active(): Promise<PaymentGatewayPort> {
    this.cachedProvider = await this.providers.resolve();
    return this.byProvider(this.cachedProvider);
  }

  async createPayment(req: CreatePaymentRequest): Promise<PaymentResult> {
    return (await this.active()).createPayment(req);
  }

  async capturePayment(gatewayPaymentId: string, amountRub?: number): Promise<PaymentResult> {
    return (await this.active()).capturePayment(gatewayPaymentId, amountRub);
  }

  async cancelPayment(gatewayPaymentId: string): Promise<void> {
    return (await this.active()).cancelPayment(gatewayPaymentId);
  }

  async createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult> {
    return (await this.active()).createRefund(gatewayPaymentId, amountRub);
  }

  async getPayment(gatewayPaymentId: string): Promise<{ status: string }> {
    return (await this.active()).getPayment(gatewayPaymentId);
  }

  parseWebhook(payload: unknown): WebhookEvent {
    // Формат callback зависит от эквайера (PayKeeper отличается от YooKassa) —
    // делегируем адаптеру активного провайдера (по прогретому кэшу).
    return this.byProvider(this.cachedProvider).parseWebhook(payload);
  }

  /** Тестовый помощник mock-эквайринга (dev): пометить платёж оплаченным. */
  markSucceeded(gatewayPaymentId: string): void {
    this.mock.markSucceeded(gatewayPaymentId);
  }
}
