import { describe, expect, it } from 'vitest';
import { buildCreatePaymentBody, buildRefundBody, sanitizePhone } from './request.builder.js';
import type { CreatePaymentRequest } from './yookassa.types.js';

const baseReq: CreatePaymentRequest = {
  amountRub: 12000,
  currency: 'RUB',
  description: 'Проживание · Тест',
  capture: true,
  bookingId: 'bk-1',
  returnUrl: 'https://dha.ru/bookings',
  idempotenceKey: 'idem-1',
  receipt: {
    customer: { email: 'g@dha.ru', phone: '+7 (900) 123-45-67' },
    items: [
      {
        description: 'Проживание',
        quantity: 1,
        amount: { value: '12000.00', currency: 'RUB' },
        vatCode: 1,
        paymentSubject: 'service',
        paymentMode: 'full_payment',
      },
    ],
  },
};

describe('sanitizePhone', () => {
  it('оставляет только цифры (формат E.164 без +)', () => {
    expect(sanitizePhone('+7 (900) 123-45-67')).toBe('79001234567');
  });
  it('возвращает undefined для пустого', () => {
    expect(sanitizePhone(undefined)).toBeUndefined();
    expect(sanitizePhone('—')).toBeUndefined();
  });
});

describe('buildCreatePaymentBody', () => {
  const body = buildCreatePaymentBody(baseReq);

  it('форматирует сумму с двумя знаками и валютой', () => {
    expect(body.amount).toEqual({ value: '12000.00', currency: 'RUB' });
  });

  it('строит confirmation redirect с return_url', () => {
    expect(body.confirmation).toEqual({ type: 'redirect', return_url: 'https://dha.ru/bookings' });
  });

  it('кладёт bookingId в metadata', () => {
    expect(body.metadata).toEqual({ bookingId: 'bk-1' });
  });

  it('маппит позиции чека в snake_case (54-ФЗ)', () => {
    expect(body.receipt.items[0]).toEqual({
      description: 'Проживание',
      quantity: '1.00',
      amount: { value: '12000.00', currency: 'RUB' },
      vat_code: 1,
      payment_subject: 'service',
      payment_mode: 'full_payment',
    });
  });

  it('нормализует телефон покупателя', () => {
    expect(body.receipt.customer).toEqual({ email: 'g@dha.ru', phone: '79001234567' });
  });

  it('опускает пустые контакты покупателя', () => {
    const b = buildCreatePaymentBody({
      ...baseReq,
      receipt: { customer: { email: undefined, phone: undefined }, items: baseReq.receipt.items },
    });
    expect(b.receipt.customer).toEqual({});
  });
});

describe('buildRefundBody', () => {
  it('строит тело возврата с payment_id и суммой', () => {
    expect(buildRefundBody('pay-9', 5000)).toEqual({
      amount: { value: '5000.00', currency: 'RUB' },
      payment_id: 'pay-9',
    });
  });
});
