/**
 * Способы онлайн-оплаты, поддерживаемые эквайрингом (Банк «Санкт-Петербург»):
 *  - card — банковские карты (МИР, Visa, MasterCard, UnionPay);
 *  - sbp  — Система быстрых платежей (динамический QR / оплата по кнопке).
 *
 * Набор разрешённых способов — рантайм-настройка (Настройки → Финансы), хранится в
 * таблице Setting под ключом PAYMENT_METHODS_KEY. Именно её редактирует владелец,
 * чтобы, например, оставить только СБП. Значение читают и админка (FinanceService),
 * и слой оплаты (PaymentsService) — поэтому ключ и парсер вынесены в общий модуль.
 */
export type PaymentMethod = 'card' | 'sbp';

/** Все поддерживаемые способы (порядок = порядок отображения). */
export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = ['card', 'sbp'];

/** Ключ настройки со списком включённых способов (JSON-массив PaymentMethod). */
export const PAYMENT_METHODS_KEY = 'finance.payment.methods';

/**
 * Разобрать сохранённое значение настройки в список способов.
 * По умолчанию (значение не задано/битое) — включены все способы.
 * Пустой список недопустим (нечем платить) → трактуем как «все».
 */
export function parsePaymentMethods(raw?: string | null): PaymentMethod[] {
  if (!raw) return [...ALL_PAYMENT_METHODS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...ALL_PAYMENT_METHODS];
    const methods = parsed.filter(
      (m): m is PaymentMethod => (ALL_PAYMENT_METHODS as readonly string[]).includes(m as string),
    );
    return methods.length ? methods : [...ALL_PAYMENT_METHODS];
  } catch {
    return [...ALL_PAYMENT_METHODS];
  }
}

/** Сериализовать список способов для сохранения в Setting. */
export function serializePaymentMethods(methods: PaymentMethod[]): string {
  const unique = ALL_PAYMENT_METHODS.filter((m) => methods.includes(m));
  return JSON.stringify(unique.length ? unique : [...ALL_PAYMENT_METHODS]);
}
