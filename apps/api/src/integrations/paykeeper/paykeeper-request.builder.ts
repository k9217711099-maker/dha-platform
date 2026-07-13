import type { CreatePaymentRequest, Receipt, WebhookEvent } from '../yookassa/yookassa.types.js';
import { sanitizePhone } from '../yookassa/request.builder.js';

/**
 * Чистые функции PayKeeper: тело создания счёта (form-urlencoded), корзина чека
 * (54-ФЗ), маппинг статуса и разбор callback. Тестируются без сети.
 */

/** Код ставки НДС (наш) → тип ставки PayKeeper. 1 — без НДС. */
function paykeeperTax(vatCode: number): string {
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

/** Дата в формате PayKeeper (YYYY-MM-DD). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Корзина чека для 54-ФЗ (PayKeeper фискализирует счёт по этим позициям). */
export function buildCart(receipt: Receipt): string {
  return JSON.stringify(
    receipt.items.map((i) => ({
      name: i.description,
      price: Number(i.amount.value),
      quantity: i.quantity,
      sum: Number(i.amount.value) * i.quantity,
      tax: paykeeperTax(i.vatCode),
      item_type: i.paymentSubject,
      payment_type: i.paymentMode,
    })),
  );
}

/**
 * Тело POST /change/invoice/preview/ (без token — его добавляет адаптер).
 * pay_amount — в рублях (десятичная строка). expiry — срок жизни счёта.
 * Ограничение способов оплаты (карты/СБП) у PayKeeper задаётся в ЛК мерчанта;
 * набор из настроек передаём в custom_data как подсказку (точное поле — по докам).
 */
export function buildInvoiceParams(req: CreatePaymentRequest, now: Date = new Date()): Record<string, string> {
  const expiry = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const params: Record<string, string> = {
    pay_amount: req.amountRub.toFixed(2),
    clientid: (req.receipt.customer.email || req.receipt.customer.phone || 'Гость').slice(0, 255),
    orderid: req.bookingId,
    service_name: req.description.slice(0, 255),
    expiry: ymd(expiry),
    cart: buildCart(req.receipt),
  };
  const email = req.receipt.customer.email;
  const phone = sanitizePhone(req.receipt.customer.phone);
  if (email) params.client_email = email;
  if (phone) params.client_phone = phone;
  if (req.allowedMethods && req.allowedMethods.length > 0 && req.allowedMethods.length < 2) {
    params.custom_data = JSON.stringify({ allowedMethods: req.allowedMethods });
  }
  return params;
}

/** Тело POST /change/payment/reverse/ (возврат). */
export function buildRefundParams(paymentId: string, amountRub: number): Record<string, string> {
  return { id: paymentId, amount: amountRub.toFixed(2) };
}

/**
 * Статус счёта PayKeeper → словарь шлюза (succeeded/canceled/pending),
 * который понимает PaymentsService.mapGatewayStatus.
 */
export function mapInvoiceStatus(status: string | undefined): string {
  switch (status) {
    case 'paid':
      return 'succeeded';
    case 'expired':
      return 'canceled';
    default:
      return 'pending';
  }
}

/**
 * Разбор callback PayKeeper. Уведомление приходит при успешной оплате; содержит
 * id платежа, sum и (для оплат по счёту) invoice_id. Сопоставление в системе идёт
 * по invoice_id (= сохранённый gatewayPaymentId); фолбэк-поллинг подстрахует.
 * Проверку подписи (md5(id+sum+secret)) выполняет адаптер, где доступен секрет.
 */
export function parsePaykeeperCallback(payload: unknown): WebhookEvent {
  const b = payload as Record<string, unknown>;
  const id =
    (typeof b.invoice_id === 'string' && b.invoice_id) ||
    (typeof b.id === 'string' && b.id) ||
    '';
  if (!id) throw new Error('PayKeeper callback: отсутствует id/invoice_id');
  return { event: 'payment', gatewayPaymentId: id, status: 'succeeded' };
}
