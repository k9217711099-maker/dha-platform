import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PaymentGatewayPort } from '../yookassa/payment-gateway.port.js';
import type {
  CreatePaymentRequest,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from '../yookassa/yookassa.types.js';
import { BSPB_PATHS } from './bspb.types.js';
import type {
  BspbActionResponse,
  BspbRegisterResponse,
  BspbStatusResponse,
} from './bspb.types.js';
import {
  buildActionParams,
  buildRegisterParams,
  mapOrderStatus,
  parseBspbCallback,
} from './bspb-request.builder.js';
import { BspbConfigService } from './bspb-config.service.js';
import type { BspbCredentials } from './bspb-config.service.js';

const TIMEOUT_MS = 20_000;

/** Реквизиты для точечной проверки (пусто → берутся сохранённые). */
export type BspbCredentialOverrides = Partial<Pick<BspbCredentials, 'apiBase' | 'merchantId' | 'username' | 'password'>>;

/** Результат проверки подключения к БСПБ. */
export interface BspbPingResult {
  ok: boolean;
  message: string;
}

/**
 * Реальный адаптер интернет-эквайринга Банка «Санкт-Петербург».
 * Включается при PAYMENT_PROVIDER=bspb. Server-to-server REST (RBS-семейство):
 * Basic-auth (мерчант) + опциональный клиентский сертификат mTLS. Реквизиты
 * подключения читаются динамически из BspbConfigService (админка → Setting,
 * env как запас) — смена в UI включает интеграцию без перезапуска. Точные
 * пути/поля — по референсу БСПБ; при расхождении правится только этот адаптер.
 *
 * Фискализация (54-ФЗ) здесь НЕ выполняется — эквайринг БСПБ чеки в ОФД не бьёт.
 * Чек пробивается отдельно через FiscalPort (см. FISCAL_PROVIDER).
 */
@Injectable()
export class HttpBspbAdapter extends PaymentGatewayPort {
  private readonly logger = new Logger(HttpBspbAdapter.name);
  /** Кэш mTLS-диспетчера по паре путей сертификата. */
  private dispatcherKey = '';
  private dispatcher: unknown;

  constructor(private readonly cfg: BspbConfigService) {
    super();
  }

  /** Ленивый mTLS-диспетчер (undici) по сертификату из конфигурации. */
  private async getDispatcher(cert?: string, key?: string): Promise<unknown> {
    const wantKey = `${cert ?? ''}::${key ?? ''}`;
    if (this.dispatcherKey === wantKey) return this.dispatcher;
    this.dispatcherKey = wantKey;
    if (!cert || !key) {
      this.dispatcher = null;
      return null;
    }
    try {
      // Специфер в переменной — undici опционален (глобальный fetch в Node уже
      // на нём построен), поэтому не тащим его как жёсткую зависимость сборки.
      const specifier = 'undici';
      const { Agent } = (await import(specifier)) as { Agent: new (opts: unknown) => unknown };
      this.dispatcher = new Agent({ connect: { cert: readFileSync(cert), key: readFileSync(key) } });
    } catch (e) {
      this.logger.error(`BSPB: не удалось настроить клиентский сертификат: ${(e as Error).message}`);
      this.dispatcher = null;
    }
    return this.dispatcher;
  }

  /** Низкоуровневый POST form-urlencoded к шлюзу (без разбора errorCode). Кидает только на сеть/таймаут. */
  private async fetchGateway(creds: BspbCredentials, path: string, params: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams({ userName: creds.username, password: creds.password, ...params });
    body.set('merchant', creds.merchantId);
    const dispatcher = await this.getDispatcher(creds.certPath, creds.keyPath);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${creds.apiBase.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          Authorization: this.basicAuth(creds),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit & { dispatcher?: unknown });
    } catch (e) {
      this.logger.error(`BSPB POST ${path} сеть/таймаут: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Платёжный шлюз БСПБ недоступен');
    } finally {
      clearTimeout(timer);
    }
  }

  /** POST к методу шлюза с разбором ответа. RBS отвечает HTTP 200 даже на бизнес-ошибку — проверяем errorCode. */
  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const creds = await this.cfg.resolve();
    if (!creds.merchantId || !creds.username || !creds.password) {
      throw new ServiceUnavailableException(
        'Эквайринг БСПБ не настроен: заполните реквизиты в Настройки → Финансы',
      );
    }
    const res = await this.fetchGateway(creds, path, params);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      errorCode?: string;
      errorMessage?: string;
    };
    if (!res.ok || (data.errorCode !== undefined && String(data.errorCode) !== '0')) {
      const desc = (data.errorMessage as string) ?? `HTTP ${res.status}`;
      this.logger.error(`BSPB POST ${path} → errorCode=${data.errorCode}: ${desc}`);
      throw new ServiceUnavailableException(`Ошибка БСПБ: ${desc}`);
    }
    return data as T;
  }

  /**
   * Проверка подключения. Делает тестовый запрос статуса по несуществующему orderId:
   *  - errorCode 6 (заказ не найден) — авторизация прошла, связь есть;
   *  - errorCode 5 / «access denied» — реквизиты отклонены банком;
   *  - сеть/таймаут — шлюз недоступен.
   * overrides позволяют проверить значения из формы до сохранения (пустой пароль → сохранённый).
   * Точные коды ошибок — по референсу БСПБ; при расхождении правится только этот метод.
   */
  async ping(overrides?: BspbCredentialOverrides): Promise<BspbPingResult> {
    const base = await this.cfg.resolve();
    const creds: BspbCredentials = {
      ...base,
      apiBase: overrides?.apiBase?.trim() || base.apiBase,
      merchantId: overrides?.merchantId?.trim() || base.merchantId,
      username: overrides?.username?.trim() || base.username,
      password: overrides?.password || base.password,
    };
    if (!creds.merchantId || !creds.username || !creds.password) {
      return { ok: false, message: 'Реквизиты подключения заполнены не полностью (нужны Merchant ID, логин и пароль).' };
    }
    try {
      const res = await this.fetchGateway(creds, BSPB_PATHS.status, { orderId: `dha-conn-test-${randomUUID()}` });
      const data = (await res.json().catch(() => ({}))) as { errorCode?: unknown; errorMessage?: string };
      const code = String(data.errorCode ?? '');
      const msg = data.errorMessage ?? '';
      if (code === '0' || code === '6') return { ok: true, message: 'Связь с БСПБ установлена, реквизиты приняты.' };
      if (code === '5' || /access|denied|доступ|логин|password|парол/i.test(msg)) {
        return { ok: false, message: `БСПБ отклонил реквизиты${msg ? `: ${msg}` : ` (код ${code})`}.` };
      }
      return { ok: false, message: `Неожиданный ответ БСПБ: код ${code}${msg ? ` — ${msg}` : ''}.` };
    } catch (e) {
      return { ok: false, message: (e as Error).message || 'Платёжный шлюз БСПБ недоступен.' };
    }
  }

  private basicAuth(creds: BspbCredentials): string {
    return 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  }

  async createPayment(req: CreatePaymentRequest): Promise<PaymentResult> {
    const path = req.capture ? BSPB_PATHS.register : BSPB_PATHS.registerPreAuth;
    const r = await this.call<BspbRegisterResponse>(path, buildRegisterParams(req));
    if (!r.orderId) throw new ServiceUnavailableException('БСПБ не вернул orderId');
    return { gatewayPaymentId: r.orderId, status: 'pending', confirmationUrl: r.formUrl ?? null };
  }

  async capturePayment(gatewayPaymentId: string, amountRub?: number): Promise<PaymentResult> {
    await this.call<BspbActionResponse>(BSPB_PATHS.deposit, buildActionParams(gatewayPaymentId, amountRub));
    return { gatewayPaymentId, status: 'succeeded', confirmationUrl: null };
  }

  async cancelPayment(gatewayPaymentId: string): Promise<void> {
    await this.call<BspbActionResponse>(BSPB_PATHS.reverse, buildActionParams(gatewayPaymentId));
  }

  async createRefund(gatewayPaymentId: string, amountRub: number): Promise<RefundResult> {
    await this.call<BspbActionResponse>(BSPB_PATHS.refund, buildActionParams(gatewayPaymentId, amountRub));
    return { refundId: gatewayPaymentId, status: 'succeeded' };
  }

  async getPayment(gatewayPaymentId: string): Promise<{ status: string }> {
    const r = await this.call<BspbStatusResponse>(BSPB_PATHS.status, { orderId: gatewayPaymentId });
    return { status: mapOrderStatus(r.orderStatus) };
  }

  parseWebhook(payload: unknown): WebhookEvent {
    return parseBspbCallback(payload);
  }
}
