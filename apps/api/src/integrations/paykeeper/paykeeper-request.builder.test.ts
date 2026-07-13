import { describe, expect, it } from 'vitest';
import {
  buildCart,
  buildInvoiceParams,
  buildRefundParams,
  mapInvoiceStatus,
  parsePaykeeperCallback,
} from './paykeeper-request.builder.js';
import type { CreatePaymentRequest } from '../yookassa/yookassa.types.js';

const base: CreatePaymentRequest = {
  amountRub: 1500,
  currency: 'RUB',
  description: 'Проживание',
  capture: true,
  bookingId: 'bk-7',
  returnUrl: 'https://app/return',
  idempotenceKey: 'idem',
  receipt: {
    customer: { email: 'g@ex.com', phone: '+7 (900) 123-45-67' },
    items: [{ description: 'Ночь', quantity: 2, amount: { value: '750.00', currency: 'RUB' }, vatCode: 1, paymentSubject: 'service', paymentMode: 'full_payment' }],
  },
};

describe('paykeeper request builder', () => {
  it('создаёт тело счёта: сумма в рублях, orderid, email/phone', () => {
    const p = buildInvoiceParams(base, new Date('2026-07-09T00:00:00Z'));
    expect(p.pay_amount).toBe('1500.00');
    expect(p.orderid).toBe('bk-7');
    expect(p.client_email).toBe('g@ex.com');
    expect(p.client_phone).toBe('79001234567');
    expect(p.expiry).toBe('2026-07-12');
    expect(p.token).toBeUndefined(); // токен добавляет адаптер
  });

  it('корзина чека формируется из позиций', () => {
    const cart = JSON.parse(buildCart(base.receipt)) as Array<Record<string, unknown>>;
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ name: 'Ночь', price: 750, quantity: 2, sum: 1500, tax: 'none', item_type: 'service', payment_type: 'full_payment' });
  });

  it('ограничение способов пишется в custom_data только при неполном наборе', () => {
    expect(buildInvoiceParams(base).custom_data).toBeUndefined();
    expect(buildInvoiceParams({ ...base, allowedMethods: ['card', 'sbp'] }).custom_data).toBeUndefined();
    const only = buildInvoiceParams({ ...base, allowedMethods: ['sbp'] });
    expect(JSON.parse(only.custom_data ?? '{}')).toEqual({ allowedMethods: ['sbp'] });
  });

  it('refund: id + сумма в рублях', () => {
    expect(buildRefundParams('inv-1', 500)).toEqual({ id: 'inv-1', amount: '500.00' });
  });

  it('маппинг статуса счёта', () => {
    expect(mapInvoiceStatus('paid')).toBe('succeeded');
    expect(mapInvoiceStatus('expired')).toBe('canceled');
    expect(mapInvoiceStatus('created')).toBe('pending');
    expect(mapInvoiceStatus('sent')).toBe('pending');
    expect(mapInvoiceStatus(undefined)).toBe('pending');
  });

  it('callback: сопоставление по invoice_id, статус succeeded', () => {
    expect(parsePaykeeperCallback({ invoice_id: 'inv-9', id: '55', sum: '1500' })).toEqual({ event: 'payment', gatewayPaymentId: 'inv-9', status: 'succeeded' });
    expect(parsePaykeeperCallback({ id: '55' }).gatewayPaymentId).toBe('55');
  });

  it('callback без идентификатора — ошибка', () => {
    expect(() => parsePaykeeperCallback({ sum: '10' })).toThrow();
  });
});
