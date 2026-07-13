/**
 * Внутренние типы платёжного шлюза Банка «Санкт-Петербург».
 *
 * Шлюз БСПБ относится к RBS-семейству (register.do / getOrderStatusExtended.do,
 * суммы в копейках, errorCode='0' — успех). Точные пути и имена параметров —
 * по полному API-референсу БСПБ (раздел «Базовые запросы» на pgtest.bspb.ru/api)
 * и согласованию с internet_acquiring@bspb.ru. Здесь модель RBS как база.
 */

/** Пути методов шлюза (относительно BSPB_API_BASE). */
export const BSPB_PATHS = {
  register: '/api/rest/register.do',
  registerPreAuth: '/api/rest/registerPreAuth.do',
  status: '/api/rest/getOrderStatusExtended.do',
  deposit: '/api/rest/deposit.do',
  reverse: '/api/rest/reverse.do',
  refund: '/api/rest/refund.do',
} as const;

/** Ответ register.do / registerPreAuth.do. */
export interface BspbRegisterResponse {
  orderId?: string;
  formUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Ответ getOrderStatusExtended.do. */
export interface BspbStatusResponse {
  /** Статус заказа RBS (см. mapOrderStatus). */
  orderStatus?: number;
  /** Код действия последней операции (0 — успех). */
  actionCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

/** Общий ответ deposit/reverse/refund. */
export interface BspbActionResponse {
  errorCode?: string;
  errorMessage?: string;
}
