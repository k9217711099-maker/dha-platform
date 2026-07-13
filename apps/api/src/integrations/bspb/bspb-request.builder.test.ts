import { describe, expect, it } from 'vitest';
import {
  buildActionParams,
  buildRegisterParams,
  mapOrderStatus,
  parseBspbCallback,
  toKopecks,
} from './bspb-request.builder.js';
import type { CreatePaymentRequest } from '../yookassa/yookassa.types.js';

const base: CreatePaymentRequest = {
  amountRub: 1234.5,
  currency: 'RUB',
  description: 'Проживание',
  capture: true,
  bookingId: 'bk-1',
  returnUrl: 'https://app/return',
  idempotenceKey: 'idem-1',
  receipt: { customer: { email: 'g@ex.com' }, items: [] },
};

describe('bspb request builder', () => {
  it('переводит рубли в копейки', () => {
    expect(toKopecks(1234.5)).toBe(123450);
    expect(toKopecks(0.1)).toBe(10);
  });

  it('register: сумма в копейках, RUB=643, orderNumber=bookingId', () => {
    const p = buildRegisterParams(base);
    expect(p.amount).toBe('123450');
    expect(p.currency).toBe('643');
    expect(p.orderNumber).toBe('bk-1');
    expect(JSON.parse(p.jsonParams ?? "{}")).toMatchObject({ bookingId: 'bk-1' });
  });

  it('без ограничения способов не гасит карты/СБП', () => {
    const p = buildRegisterParams(base);
    const jp = JSON.parse(p.jsonParams ?? "{}");
    expect(jp.sbpEnabled).toBeUndefined();
    expect(jp.cardEnabled).toBeUndefined();
  });

  it('только СБП: включает СБП и гасит карты', () => {
    const p = buildRegisterParams({ ...base, allowedMethods: ['sbp'] });
    const jp = JSON.parse(p.jsonParams ?? "{}");
    expect(jp.sbpEnabled).toBe('true');
    expect(jp.cardEnabled).toBe('false');
  });

  it('только карты: включает карты и гасит СБП', () => {
    const p = buildRegisterParams({ ...base, allowedMethods: ['card'] });
    const jp = JSON.parse(p.jsonParams ?? "{}");
    expect(jp.cardEnabled).toBe('true');
    expect(jp.sbpEnabled).toBe('false');
  });

  it('оба способа — ограничение не применяется', () => {
    const p = buildRegisterParams({ ...base, allowedMethods: ['card', 'sbp'] });
    const jp = JSON.parse(p.jsonParams ?? "{}");
    expect(jp.sbpEnabled).toBeUndefined();
  });

  it('action params: orderId + сумма в копейках', () => {
    expect(buildActionParams('o1', 100)).toEqual({ orderId: 'o1', amount: '10000' });
    expect(buildActionParams('o1')).toEqual({ orderId: 'o1' });
  });

  it('маппинг orderStatus RBS → словарь шлюза', () => {
    expect(mapOrderStatus(2)).toBe('succeeded');
    expect(mapOrderStatus(1)).toBe('waiting_for_capture');
    expect(mapOrderStatus(3)).toBe('canceled');
    expect(mapOrderStatus(6)).toBe('canceled');
    expect(mapOrderStatus(4)).toBe('refunded');
    expect(mapOrderStatus(0)).toBe('pending');
    expect(mapOrderStatus(undefined)).toBe('pending');
  });

  it('callback: deposited+status=1 → succeeded', () => {
    const e = parseBspbCallback({ mdOrder: 'o9', operation: 'deposited', status: '1' });
    expect(e).toEqual({ event: 'deposited', gatewayPaymentId: 'o9', status: 'succeeded' });
  });

  it('callback: refunded → refunded, reversed → canceled', () => {
    expect(parseBspbCallback({ orderId: 'o1', operation: 'refunded', status: '1' }).status).toBe('refunded');
    expect(parseBspbCallback({ orderId: 'o1', operation: 'reversed', status: '1' }).status).toBe('canceled');
  });

  it('callback без orderId — ошибка', () => {
    expect(() => parseBspbCallback({ operation: 'deposited' })).toThrow();
  });
});
