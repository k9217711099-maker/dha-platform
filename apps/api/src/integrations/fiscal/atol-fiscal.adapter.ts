import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalPort } from './fiscal.port.js';
import type { FiscalReceiptRequest, FiscalResult } from './fiscal.port.js';
import type { Receipt } from '../yookassa/yookassa.types.js';
import type { Env } from '../../config/env.schema.js';

const TIMEOUT_MS = 20_000;
/** Токен АТОЛ живёт ~24 ч; обновляем с запасом. */
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

/** Код ставки НДС (наш) → тип НДС в АТОЛ. 1 — без НДС. */
function vatType(vatCode: number): string {
  switch (vatCode) {
    case 2:
      return 'vat0';
    case 3:
      return 'vat10';
    case 4:
      return 'vat20';
    default:
      return 'none';
  }
}

/** Метка времени в формате АТОЛ: dd.mm.yyyy HH:MM:SS. */
function atolTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Фискализация через АТОЛ Онлайн (v4): getToken → {group}/sell.
 * Включается при FISCAL_PROVIDER=atol. Ошибки не роняют оплату — возвращаем failed.
 * Онлайн-касса пробивает чек и передаёт его в ОФД (актуально для эквайринга БСПБ,
 * который сам чеки не формирует).
 */
@Injectable()
export class AtolFiscalAdapter extends FiscalPort {
  private readonly logger = new Logger(AtolFiscalAdapter.name);
  private token: { value: string; at: number } | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  enabled(): boolean {
    return !!this.config.get('ATOL_LOGIN', { infer: true }) && !!this.config.get('ATOL_GROUP_CODE', { infer: true });
  }
  provider(): string {
    return 'atol';
  }

  private get base(): string {
    return this.config.get('ATOL_API_BASE', { infer: true }).replace(/\/$/, '');
  }

  private async post<T>(url: string, body: unknown, auth = false): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(auth ? { Token: await this.getToken() } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return (await res.json().catch(() => ({}))) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() - this.token.at < TOKEN_TTL_MS) return this.token.value;
    const r = await this.post<{ token?: string; error?: { text?: string } }>(`${this.base}/getToken`, {
      login: this.config.get('ATOL_LOGIN', { infer: true }),
      pass: this.config.get('ATOL_PASSWORD', { infer: true }),
    });
    if (!r.token) throw new Error(`АТОЛ getToken: ${r.error?.text ?? 'нет токена'}`);
    this.token = { value: r.token, at: Date.now() };
    return r.token;
  }

  private buildSellBody(req: FiscalReceiptRequest) {
    const sno = this.config.get('ATOL_SNO', { infer: true });
    const receipt: Receipt = req.receipt;
    return {
      external_id: req.paymentId,
      timestamp: atolTimestamp(),
      receipt: {
        client: {
          email: receipt.customer.email || undefined,
          phone: receipt.customer.phone || undefined,
        },
        company: {
          email: this.config.get('ATOL_LOGIN', { infer: true }),
          sno,
          inn: this.config.get('ATOL_INN', { infer: true }),
          payment_address: this.config.get('ATOL_PAYMENT_ADDRESS', { infer: true }),
        },
        items: receipt.items.map((i) => ({
          name: i.description,
          price: Number(i.amount.value),
          quantity: i.quantity,
          sum: Number(i.amount.value) * i.quantity,
          payment_method: i.paymentMode,
          payment_object: i.paymentSubject,
          vat: { type: vatType(i.vatCode) },
        })),
        payments: [{ type: 1, sum: req.amountRub }],
        total: req.amountRub,
      },
    };
  }

  async register(req: FiscalReceiptRequest): Promise<FiscalResult> {
    const group = this.config.get('ATOL_GROUP_CODE', { infer: true });
    if (!this.enabled()) return { provider: 'atol', status: 'failed', error: 'АТОЛ не настроен' };
    try {
      const r = await this.post<{ uuid?: string; error?: { text?: string }; status?: string }>(
        `${this.base}/${group}/sell`,
        this.buildSellBody(req),
        true,
      );
      if (!r.uuid) return { provider: 'atol', status: 'failed', error: r.error?.text ?? 'нет uuid' };
      // Документ принят в обработку; финальный статус — по отчёту /report/{uuid}.
      return { provider: 'atol', status: 'pending', fiscalId: r.uuid };
    } catch (e) {
      this.logger.error(`АТОЛ sell по платежу ${req.paymentId}: ${(e as Error).message}`);
      return { provider: 'atol', status: 'failed', error: (e as Error).message };
    }
  }
}
