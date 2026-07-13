/**
 * Внутренние типы PayKeeper (JSON API). Поток: получить токен
 * (GET /info/settings/token/, Basic-auth) → создать счёт
 * (POST /change/invoice/preview/) → редирект гостя на invoice_url →
 * статус (GET /info/invoice/byid/). Точные поля — по докам docs.paykeeper.ru.
 */

/** Пути методов относительно адреса ЛК мерчанта (PAYKEEPER_SERVER). */
export const PAYKEEPER_PATHS = {
  token: '/info/settings/token/',
  createInvoice: '/change/invoice/preview/',
  invoiceStatus: '/info/invoice/byid/',
  refund: '/change/payment/reverse/',
} as const;

export interface PaykeeperTokenResponse {
  token?: string;
}

/** Ответ POST /change/invoice/preview/. */
export interface PaykeeperInvoiceResponse {
  invoice_id?: string;
  /** Готовая ссылка на оплату счёта. */
  invoice_url?: string;
  /** HTML-превью письма (не используется). */
  invoice?: string;
  result?: string;
  msg?: string;
}

/** Ответ GET /info/invoice/byid/ — статус: created | sent | paid | expired. */
export interface PaykeeperInvoiceStatusResponse {
  status?: string;
}

/** Общий ответ операций (reverse и т.п.). */
export interface PaykeeperActionResponse {
  result?: string;
  msg?: string;
}
