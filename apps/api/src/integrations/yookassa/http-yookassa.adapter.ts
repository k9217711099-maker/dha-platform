import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayPort } from './payment-gateway.port.js';
import { parseYooKassaWebhook } from './webhook.parser.js';
import { buildCreatePaymentBody, buildRefundBody } from './request.builder.js';
import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from './yookassa.types.js';
import type { Env } from '../../config/env.schema.js';

const API_BASE = 'https://api.yookassa.ru/v3';
const TIMEOUT_MS = 15_000;

/** Ответ YooKassa на операции с платежом. */
interface YooKassaPayment {
  id: string;
  status: string;
  confirmation?: { confirmation_url?: string };
}

/**
 * Реальный адаптер YooKassa (REST API v3, Basic-auth shopId:secretKey).
 * Включается при YOOKASSA_PROVIDER=yookassa. Чек 54-ФЗ передаётся в каждом
 * createPayment, поэтому ОФД-чек формируется автоматически на стороне YooKassa.
 */
@Injectable()
export class HttpYooKassaAdapter extends PaymentGatewayPort {
  private readonly logger = new Logger(HttpYooKassaAdapter.name);
  private readonly authHeader: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const shopId = config.get('YOOKASSA_SHOP_ID', { infer: true }) ?? '';
    const secretKey = config.get('YOOKASSA_SECRET_KEY', { infer: true }) ?? '';
    this.authHeader = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  }

  /**
   * Запрос к YooKassa. POST требует Idempotence-Key (защита от двойного списания);
   * для GET он не нужен.
   */
  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; idempotenceKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
    if (method === 'POST') {
      headers['Idempotence-Key'] = opts.idempotenceKey ?? randomUUID();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      this.logger.error(`YooKassa ${method} ${path} сеть/таймаут: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Платёжный шлюз недоступен');
    } finally {
      clearTimeout(timer);
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const desc = (data.description as string) ?? `HTTP ${res.status}`;
      this.logger.error(`YooKassa ${method} ${path} → ${res.status}: ${desc}`);
      throw new ServiceUnavailableException(`Ошибка YooKassa: ${desc}`);
    }
    return data as T;
  }

  async createPayment(req: CreatePaymentRequest): Promise<PaymentResult> {
    const body = buildCreatePaymentBody(req);
    const p = await this.call<YooKassaPayment>('POST', '/payments', {
      body,
      idempotenceKey: req.idempotenceKey,
    });
    return {
      gatewayPaymentId: p.id,
      status: p.status,
      confirmationUrl: p.confirmation?.confirmation_url ?? null,
    };
  }

  async capturePayment(gatewayPaymentId: string, amountRub?: number): Promise<PaymentResult> {
    const body = amountRub !== undefined
      ? { amount: { value: amountRub.toFixed(2), currency: 'RUB' } }
      : {};
    const p = await this.call<YooKassaPayment>(
      'POST',
      `/payments/${gatewayPaymentId}/capture`,
      { body },
    );
    return {
      gatewayPaymentId: p.id,
      status: p.status,
      confirmationUrl: p.confirmation?.confirmation_url ?? null,
    };
  }

  async cancelPayment(gatewayPaymentId: string): Promise<void> {
    await this.call<YooKassaPayment>('POST', `/payments/${gatewayPaymentId}/cancel`, { body: {} });
  }

  async createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult> {
    const r = await this.call<{ id: string; status: string }>('POST', '/refunds', {
      body: buildRefundBody(gatewayPaymentId, amountRub),
    });
    return { refundId: r.id, status: r.status };
  }

  async getPayment(gatewayPaymentId: string): Promise<{ status: string }> {
    const p = await this.call<YooKassaPayment>('GET', `/payments/${gatewayPaymentId}`);
    return { status: p.status };
  }

  parseWebhook(payload: unknown): WebhookEvent {
    return parseYooKassaWebhook(payload);
  }
}
