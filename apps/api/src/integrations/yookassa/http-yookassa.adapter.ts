import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PaymentGatewayPort } from './payment-gateway.port.js';
import { parseYooKassaWebhook } from './webhook.parser.js';
import { buildCreatePaymentBody, buildRefundBody } from './request.builder.js';
import { YooKassaConfigService } from './yookassa-config.service.js';
import type { YooKassaCredentials } from './yookassa-config.service.js';
import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from './yookassa.types.js';

const API_BASE = 'https://api.yookassa.ru/v3';
const TIMEOUT_MS = 15_000;

/** Ответ YooKassa на операции с платежом. */
interface YooKassaPayment {
  id: string;
  status: string;
  confirmation?: { confirmation_url?: string };
}

/** Реквизиты для точечной проверки (пусто → берутся сохранённые). */
export type YooKassaCredentialOverrides = Partial<YooKassaCredentials>;

/** Результат проверки подключения. */
export interface YooKassaPingResult {
  ok: boolean;
  message: string;
}

/**
 * Реальный адаптер YooKassa (REST API v3, Basic-auth shopId:secretKey).
 * Включается при PAYMENT_PROVIDER=yookassa (или YOOKASSA_PROVIDER=yookassa). Чек
 * 54-ФЗ передаётся в каждом createPayment, поэтому ОФД-чек формируется автоматически
 * на стороне YooKassa. Реквизиты читаются динамически (YooKassaConfigService:
 * админка → Setting, env как запас) — смена в UI работает без правки .env/рестарта.
 */
@Injectable()
export class HttpYooKassaAdapter extends PaymentGatewayPort {
  private readonly logger = new Logger(HttpYooKassaAdapter.name);

  constructor(private readonly cfg: YooKassaConfigService) {
    super();
  }

  private authHeader(creds: YooKassaCredentials): string {
    return 'Basic ' + Buffer.from(`${creds.shopId}:${creds.secretKey}`).toString('base64');
  }

  private assertConfigured(creds: YooKassaCredentials): void {
    if (!creds.shopId || !creds.secretKey) {
      throw new ServiceUnavailableException('ЮKassa не настроена: заполните shopId и секретный ключ в Настройки → Финансы');
    }
  }

  /**
   * Запрос к YooKassa. POST требует Idempotence-Key (защита от двойного списания);
   * для GET он не нужен.
   */
  private async call<T>(
    creds: YooKassaCredentials,
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; idempotenceKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader(creds),
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
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const body = buildCreatePaymentBody(req);
    const p = await this.call<YooKassaPayment>(creds, 'POST', '/payments', {
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
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const body = amountRub !== undefined
      ? { amount: { value: amountRub.toFixed(2), currency: 'RUB' } }
      : {};
    const p = await this.call<YooKassaPayment>(
      creds,
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
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    await this.call<YooKassaPayment>(creds, 'POST', `/payments/${gatewayPaymentId}/cancel`, { body: {} });
  }

  async createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult> {
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const r = await this.call<{ id: string; status: string }>(creds, 'POST', '/refunds', {
      body: buildRefundBody(gatewayPaymentId, amountRub),
    });
    return { refundId: r.id, status: r.status };
  }

  async getPayment(gatewayPaymentId: string): Promise<{ status: string }> {
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const p = await this.call<YooKassaPayment>(creds, 'GET', `/payments/${gatewayPaymentId}`);
    return { status: p.status };
  }

  parseWebhook(payload: unknown): WebhookEvent {
    return parseYooKassaWebhook(payload);
  }

  /**
   * Проверка подключения: запрос GET /me (данные магазина) с текущими реквизитами.
   * Успех — shopId и секретный ключ верны. overrides позволяют проверить значения
   * из формы до сохранения (пустой ключ → сохранённый).
   */
  async ping(overrides?: YooKassaCredentialOverrides): Promise<YooKassaPingResult> {
    const b = await this.cfg.resolve();
    const creds: YooKassaCredentials = {
      shopId: overrides?.shopId?.trim() || b.shopId,
      secretKey: overrides?.secretKey || b.secretKey,
    };
    if (!creds.shopId || !creds.secretKey) {
      return { ok: false, message: 'Реквизиты заполнены не полностью (нужны shopId и секретный ключ).' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/me`, {
        method: 'GET',
        headers: { Authorization: this.authHeader(creds) },
        signal: controller.signal,
      });
      if (res.status === 401) return { ok: false, message: 'ЮKassa отклонила shopId/секретный ключ (ошибка авторизации).' };
      if (res.ok) return { ok: true, message: 'Связь с ЮKassa установлена, реквизиты приняты.' };
      const data = (await res.json().catch(() => ({}))) as { description?: string };
      return { ok: false, message: data.description ? `ЮKassa: ${data.description}` : `Неожиданный ответ ЮKassa (HTTP ${res.status}).` };
    } catch (e) {
      return { ok: false, message: (e as Error).message || 'ЮKassa недоступна.' };
    } finally {
      clearTimeout(timer);
    }
  }
}
