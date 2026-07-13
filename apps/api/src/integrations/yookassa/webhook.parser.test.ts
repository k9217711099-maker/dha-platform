import { describe, expect, it } from 'vitest';
import { parseYooKassaWebhook } from './webhook.parser.js';

describe('parseYooKassaWebhook', () => {
  it('извлекает id, статус и событие', () => {
    const e = parseYooKassaWebhook({
      event: 'payment.succeeded',
      object: { id: 'pay-1', status: 'succeeded' },
    });
    expect(e).toEqual({ event: 'payment.succeeded', gatewayPaymentId: 'pay-1', status: 'succeeded' });
  });

  it('бросает ошибку без object.id', () => {
    expect(() => parseYooKassaWebhook({ event: 'x', object: {} })).toThrow();
  });
});
