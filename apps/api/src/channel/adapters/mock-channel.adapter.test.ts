import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MockChannelAdapter } from './mock-channel.adapter.js';

const adapter = new MockChannelAdapter();
const ctx = (mode?: string) => ({ channelId: 'c1', code: 'ostrovok', credentials: mode ? { mode } : null });

describe('MockChannelAdapter.parseBooking — нормализация OTA payload', () => {
  it('маппит snake_case в модель DHP', () => {
    const n = adapter.parseBooking({
      external_booking_id: 'OTA-1', property_id: 'RP-1', room_type_id: 'RRT-1',
      arrival_date: '2026-08-01', departure_date: '2026-08-05', adults: 2, children: 1,
      guest: { first_name: 'Иван', last_name: 'Тестов', phone: '+79990000000' },
      price: { total: 40000, currency: 'RUB' }, payment: { collect_method: 'channel' },
    });
    expect(n).toMatchObject({ externalBookingId: 'OTA-1', remotePropertyId: 'RP-1', remoteRoomTypeId: 'RRT-1', adults: 2, children: 1, totalAmount: 40000, paymentCollectMode: 'channel' });
    expect(n.guest.firstName).toBe('Иван');
  });
  it('бросает при отсутствии external_booking_id', () => {
    expect(() => adapter.parseBooking({ arrival_date: '2026-08-01', departure_date: '2026-08-05' })).toThrow(BadRequestException);
  });
  it('бросает при отсутствии дат', () => {
    expect(() => adapter.parseBooking({ external_booking_id: 'X' })).toThrow(BadRequestException);
  });
});

describe('MockChannelAdapter.push — режим сбоя для ретраев', () => {
  it('успех по умолчанию', async () => {
    const r = await adapter.pushAvailability(ctx(), { roomTypes: [{}, {}] });
    expect(r.ok).toBe(true);
  });
  it('ошибка (retryable) при credentials.mode=fail', async () => {
    const r = await adapter.pushAvailability(ctx('fail'), {});
    expect(r).toMatchObject({ ok: false, errorCode: 'remote_server_error', retryable: true });
  });
});
