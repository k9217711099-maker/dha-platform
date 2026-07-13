import type { CreatePaymentRequest } from './yookassa.types.js';

/**
 * Чистые функции построения тел запросов к YooKassa REST API v3.
 * Маппинг нашей доменной модели (camelCase) → формат YooKassa (snake_case).
 * Вынесены отдельно, чтобы покрыть тестами без сети.
 */

/** Телефон для чека 54-ФЗ: только цифры в формате ITU-T E.164 без «+» (напр. 79001234567). */
export function sanitizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  return digits.length ? digits : undefined;
}

export interface YooKassaCreateBody {
  amount: { value: string; currency: string };
  capture: boolean;
  confirmation: { type: 'redirect'; return_url: string };
  description: string;
  metadata: { bookingId: string };
  receipt: {
    customer: { email?: string; phone?: string };
    items: {
      description: string;
      quantity: string;
      amount: { value: string; currency: string };
      vat_code: number;
      payment_subject: string;
      payment_mode: string;
    }[];
  };
}

/** Тело POST /v3/payments. */
export function buildCreatePaymentBody(req: CreatePaymentRequest): YooKassaCreateBody {
  const phone = sanitizePhone(req.receipt.customer.phone);
  const email = req.receipt.customer.email || undefined;
  return {
    amount: { value: req.amountRub.toFixed(2), currency: req.currency },
    capture: req.capture,
    confirmation: { type: 'redirect', return_url: req.returnUrl },
    description: req.description.slice(0, 128),
    metadata: { bookingId: req.bookingId },
    receipt: {
      customer: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
      items: req.receipt.items.map((i) => ({
        description: i.description,
        quantity: i.quantity.toFixed(2),
        amount: i.amount,
        vat_code: i.vatCode,
        payment_subject: i.paymentSubject,
        payment_mode: i.paymentMode,
      })),
    },
  };
}

/** Тело POST /v3/refunds. */
export function buildRefundBody(gatewayPaymentId: string, amountRub: number, currency = 'RUB') {
  return {
    amount: { value: amountRub.toFixed(2), currency },
    payment_id: gatewayPaymentId,
  };
}
