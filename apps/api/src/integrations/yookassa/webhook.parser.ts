import type { WebhookEvent } from './yookassa.types.js';

/**
 * Разбор уведомления YooKassa:
 * { event: 'payment.succeeded', object: { id, status } }
 * Чистая функция — покрывается тестами.
 */
export function parseYooKassaWebhook(payload: unknown): WebhookEvent {
  const body = payload as { event?: unknown; object?: { id?: unknown; status?: unknown } };
  const event = typeof body.event === 'string' ? body.event : '';
  const id = typeof body.object?.id === 'string' ? body.object.id : '';
  const status = typeof body.object?.status === 'string' ? body.object.status : '';
  if (!id) throw new Error('YooKassa webhook: отсутствует object.id');
  return { event, gatewayPaymentId: id, status };
}
