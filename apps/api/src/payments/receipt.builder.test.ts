import { describe, expect, it } from 'vitest';
import { buildReceipt } from './receipt.builder.js';

describe('buildReceipt (54-ФЗ)', () => {
  it('формирует одну позицию-услугу на полную сумму', () => {
    const receipt = buildReceipt({
      description: 'Проживание · D Studio',
      amountRub: 13000,
      email: 'a@b.ru',
    });
    expect(receipt.customer.email).toBe('a@b.ru');
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]!.amount.value).toBe('13000.00');
    expect(receipt.items[0]!.vatCode).toBe(1);
    expect(receipt.items[0]!.paymentSubject).toBe('service');
  });

  it('не падает без контактов', () => {
    const receipt = buildReceipt({ description: 'x', amountRub: 100 });
    expect(receipt.customer.email).toBeUndefined();
    expect(receipt.items[0]!.amount.value).toBe('100.00');
  });
});
