import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PaymentGatewayPort } from '../yookassa/payment-gateway.port.js';
import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from '../yookassa/yookassa.types.js';
import { PAYKEEPER_PATHS } from './paykeeper.types.js';
import type {
  PaykeeperActionResponse,
  PaykeeperInvoiceResponse,
  PaykeeperInvoiceStatusResponse,
  PaykeeperTokenResponse,
} from './paykeeper.types.js';
import {
  buildInvoiceParams,
  buildRefundParams,
  mapInvoiceStatus,
  parsePaykeeperCallback,
} from './paykeeper-request.builder.js';
import { PaykeeperConfigService } from './paykeeper-config.service.js';
import type { PaykeeperCredentials } from './paykeeper-config.service.js';

const TIMEOUT_MS = 20_000;
/** Токен PayKeeper живёт 24 ч; обновляем с запасом. */
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

/** Реквизиты для точечной проверки (пусто → берутся сохранённые). */
export type PaykeeperCredentialOverrides = Partial<Pick<PaykeeperCredentials, 'server' | 'user' | 'password'>>;

/** Результат проверки подключения. */
export interface PaykeeperPingResult {
  ok: boolean;
  message: string;
}

/**
 * Реальный адаптер PayKeeper (JSON API). Включается при PAYMENT_PROVIDER=paykeeper.
 * Поток: getToken (Basic-auth) → createInvoice → редирект гостя на invoice_url →
 * статус по invoice_id. Реквизиты читаются динамически (PaykeeperConfigService:
 * админка → Setting, env как запас). PayKeeper фискализирует счёт по корзине сам,
 * поэтому FiscalPort для него обычно не нужен (FISCAL_PROVIDER=none).
 */
@Injectable()
export class HttpPaykeeperAdapter extends PaymentGatewayPort {
  private readonly logger = new Logger(HttpPaykeeperAdapter.name);
  private token: { server: string; value: string; at: number } | null = null;

  constructor(private readonly cfg: PaykeeperConfigService) {
    super();
  }

  private basicAuth(creds: PaykeeperCredentials): string {
    return 'Basic ' + Buffer.from(`${creds.user}:${creds.password}`).toString('base64');
  }

  private assertConfigured(creds: PaykeeperCredentials): void {
    if (!creds.server || !creds.user || !creds.password) {
      throw new ServiceUnavailableException('PayKeeper не настроен: заполните реквизиты в Настройки → Финансы');
    }
  }

  /** Запрос к PayKeeper. GET — с query, POST — form-urlencoded. Кидает на сеть/таймаут. */
  private async fetchApi(
    creds: PaykeeperCredentials,
    method: 'GET' | 'POST',
    path: string,
    data: Record<string, string> = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const isGet = method === 'GET';
    const query = isGet && Object.keys(data).length ? `?${new URLSearchParams(data).toString()}` : '';
    try {
      return await fetch(`${creds.server}${path}${query}`, {
        method,
        headers: {
          Authorization: this.basicAuth(creds),
          ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
        },
        body: isGet ? undefined : new URLSearchParams(data),
        signal: controller.signal,
      });
    } catch (e) {
      this.logger.error(`PayKeeper ${method} ${path} сеть/таймаут: ${(e as Error).message}`);
      throw new ServiceUnavailableException('PayKeeper недоступен');
    } finally {
      clearTimeout(timer);
    }
  }

  private async json<T>(res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as T & { result?: string; msg?: string };
    if (!res.ok || data.result === 'fail') {
      const desc = data.msg ?? `HTTP ${res.status}`;
      throw new ServiceUnavailableException(`Ошибка PayKeeper: ${desc}`);
    }
    return data;
  }

  /** Получить (и закэшировать) токен безопасности для POST-запросов. */
  private async getToken(creds: PaykeeperCredentials): Promise<string> {
    if (this.token && this.token.server === creds.server && Date.now() - this.token.at < TOKEN_TTL_MS) {
      return this.token.value;
    }
    const res = await this.fetchApi(creds, 'GET', PAYKEEPER_PATHS.token);
    const data = await this.json<PaykeeperTokenResponse>(res);
    if (!data.token) throw new ServiceUnavailableException('PayKeeper не вернул токен');
    this.token = { server: creds.server, value: data.token, at: Date.now() };
    return data.token;
  }

  async createPayment(req: CreatePaymentRequest): Promise<PaymentResult> {
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const token = await this.getToken(creds);
    const res = await this.fetchApi(creds, 'POST', PAYKEEPER_PATHS.createInvoice, {
      ...buildInvoiceParams(req),
      token,
    });
    const inv = await this.json<PaykeeperInvoiceResponse>(res);
    if (!inv.invoice_id) throw new ServiceUnavailableException('PayKeeper не вернул invoice_id');
    return { gatewayPaymentId: inv.invoice_id, status: 'pending', confirmationUrl: inv.invoice_url ?? null };
  }

  /** PayKeeper одностадийный (счёт оплачивается целиком) — холд/capture не применяются. */
  async capturePayment(gatewayPaymentId: string): Promise<PaymentResult> {
    return { gatewayPaymentId, status: 'succeeded', confirmationUrl: null };
  }

  async cancelPayment(_gatewayPaymentId: string): Promise<void> {
    // У PayKeeper нет холда для отмены; неоплаченный счёт истекает по expiry.
  }

  async createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult> {
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const token = await this.getToken(creds);
    const res = await this.fetchApi(creds, 'POST', PAYKEEPER_PATHS.refund, {
      ...buildRefundParams(gatewayPaymentId, amountRub),
      token,
    });
    await this.json<PaykeeperActionResponse>(res);
    return { refundId: gatewayPaymentId, status: 'succeeded' };
  }

  async getPayment(gatewayPaymentId: string): Promise<{ status: string }> {
    const creds = await this.cfg.resolve();
    this.assertConfigured(creds);
    const res = await this.fetchApi(creds, 'GET', PAYKEEPER_PATHS.invoiceStatus, { id: gatewayPaymentId });
    const data = await this.json<PaykeeperInvoiceStatusResponse>(res);
    return { status: mapInvoiceStatus(data.status) };
  }

  parseWebhook(payload: unknown): WebhookEvent {
    return parsePaykeeperCallback(payload);
  }

  /**
   * Проверка подключения: запрос токена с текущими реквизитами. Успешный токен —
   * логин/пароль верны и ЛК доступен. overrides позволяют проверить значения из
   * формы до сохранения (пустой пароль → сохранённый).
   */
  async ping(overrides?: PaykeeperCredentialOverrides): Promise<PaykeeperPingResult> {
    const b = await this.cfg.resolve();
    const creds: PaykeeperCredentials = {
      ...b,
      server: (overrides?.server?.trim() || b.server).replace(/\/$/, ''),
      user: overrides?.user?.trim() || b.user,
      password: overrides?.password || b.password,
    };
    if (!creds.server || !creds.user || !creds.password) {
      return { ok: false, message: 'Реквизиты заполнены не полностью (нужны адрес ЛК, логин и пароль).' };
    }
    try {
      const res = await this.fetchApi(creds, 'GET', PAYKEEPER_PATHS.token);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'PayKeeper отклонил логин/пароль (ошибка авторизации).' };
      }
      const data = (await res.json().catch(() => ({}))) as PaykeeperTokenResponse;
      if (res.ok && data.token) return { ok: true, message: 'Связь с PayKeeper установлена, реквизиты приняты.' };
      return { ok: false, message: `Неожиданный ответ PayKeeper (HTTP ${res.status}).` };
    } catch (e) {
      return { ok: false, message: (e as Error).message || 'PayKeeper недоступен.' };
    }
  }
}
