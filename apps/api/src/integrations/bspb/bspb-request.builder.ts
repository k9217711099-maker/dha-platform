import type { CreatePaymentRequest, WebhookEvent } from '../yookassa/yookassa.types.js';

/**
 * Чистые функции для шлюза БСПБ: построение тел запросов (form-urlencoded) и
 * разбор статуса заказа. Вынесены отдельно, чтобы покрыть тестами без сети.
 */

/** Рубли → копейки (RBS принимает сумму в минимальных единицах). */
export function toKopecks(amountRub: number): number {
  return Math.round(amountRub * 100);
}

/**
 * Тело register.do / registerPreAuth.do (application/x-www-form-urlencoded).
 * userName/password подставляет адаптер (не логируем их здесь).
 *
 * Ограничение способов оплаты (Настройки → Финансы):
 *  - карты + СБП (по умолчанию) — параметр не передаём, доступны все;
 *  - только СБП — включаем СБП и гасим карточную оплату через jsonParams.
 * Точное имя параметра ограничения — по референсу БСПБ; используем jsonParams,
 * который в RBS-шлюзах пробрасывается в платёжную сессию без изменения контракта.
 */
export function buildRegisterParams(req: CreatePaymentRequest): Record<string, string> {
  const jsonParams: Record<string, string> = { bookingId: req.bookingId };

  const methods = req.allowedMethods;
  if (methods && methods.length > 0 && methods.length < 2) {
    // Ограничение задано и оно неполное — включаем только выбранные способы.
    const sbpOnly = methods.includes('sbp') && !methods.includes('card');
    const cardOnly = methods.includes('card') && !methods.includes('sbp');
    if (sbpOnly) {
      jsonParams.sbpEnabled = 'true';
      jsonParams.cardEnabled = 'false';
    } else if (cardOnly) {
      jsonParams.sbpEnabled = 'false';
      jsonParams.cardEnabled = 'true';
    }
  }

  const params: Record<string, string> = {
    orderNumber: req.bookingId,
    amount: String(toKopecks(req.amountRub)),
    currency: '643', // ISO 4217 RUB
    returnUrl: req.returnUrl,
    description: req.description.slice(0, 512),
    jsonParams: JSON.stringify(jsonParams),
  };
  const email = req.receipt.customer.email;
  if (email) params.email = email;
  return params;
}

/** Тело deposit.do / reverse.do / refund.do. */
export function buildActionParams(orderId: string, amountRub?: number): Record<string, string> {
  const params: Record<string, string> = { orderId };
  if (amountRub !== undefined) params.amount = String(toKopecks(amountRub));
  return params;
}

/**
 * Маппинг orderStatus (RBS) → словарь статусов нашего шлюза, который понимает
 * PaymentsService.mapGatewayStatus (succeeded/waiting_for_capture/canceled/refunded/pending):
 *  0 — зарегистрирован, не оплачен;         1 — предавторизован (холд);
 *  2 — оплачен (полная авторизация);        3 — отменён (реверс);
 *  4 — возврат;                             5 — инициирована 3DS;
 *  6 — авторизация отклонена.
 */
export function mapOrderStatus(orderStatus: number | undefined): string {
  switch (orderStatus) {
    case 2:
      return 'succeeded';
    case 1:
      return 'waiting_for_capture';
    case 3:
    case 6:
      return 'canceled';
    case 4:
      return 'refunded';
    default:
      return 'pending';
  }
}

/**
 * Разбор callback-уведомления БСПБ. RBS присылает orderId (mdOrder), operation и
 * status (1 — успех). Парсер устойчив к обеим формам (orderId/mdOrder).
 */
export function parseBspbCallback(payload: unknown): WebhookEvent {
  const b = payload as Record<string, unknown>;
  const orderId =
    (typeof b.mdOrder === 'string' && b.mdOrder) ||
    (typeof b.orderId === 'string' && b.orderId) ||
    '';
  if (!orderId) throw new Error('BSPB callback: отсутствует orderId/mdOrder');

  const operation = typeof b.operation === 'string' ? b.operation : '';
  const ok = String(b.status ?? '') === '1';

  let status = 'pending';
  if (operation === 'deposited' || operation === 'approved') status = ok ? 'succeeded' : 'canceled';
  else if (operation === 'refunded') status = 'refunded';
  else if (operation === 'reversed' || operation === 'declinedByTimeout') status = 'canceled';
  else if (ok) status = 'succeeded';

  return { event: operation || 'payment', gatewayPaymentId: orderId, status };
}
