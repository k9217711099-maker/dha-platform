import { describe, expect, it } from 'vitest';
import { AvitoChannelAdapter } from './avito-channel.adapter.js';
import { quoteBigIds } from './avito-http.client.js';
import type { ChannelContext } from '../../channel.types.js';

const adapter = new AvitoChannelAdapter();
const ctx = (creds: Record<string, unknown> | null): ChannelContext => ({ channelId: 'c1', code: 'avito', credentials: creds });

describe('quoteBigIds — сохранение точности avito_booking_id', () => {
  it('оквычивает 19-значный id, число не теряет точность', () => {
    const raw = '{"bookings":[{"avito_booking_id":2784166209049096851,"base_price":22713}]}';
    const parsed = JSON.parse(quoteBigIds(raw));
    expect(parsed.bookings[0].avito_booking_id).toBe('2784166209049096851');
  });

  it('малые числовые id не трогает лишний раз, но парсится корректно', () => {
    const parsed = JSON.parse(quoteBigIds('{"id":123,"item_id":8071}'));
    // короткие оставляем числами (нет риска потери точности)
    expect(parsed.id).toBe(123);
  });
});

describe('AvitoChannelAdapter.parseBooking', () => {
  const booking = {
    avito_booking_id: '2784166209049096851',
    item_id: '8071054747',
    account_id: '355873322',
    base_price: 22713,
    check_in: '2026-07-30',
    check_out: '2026-07-31',
    guest_count: 2,
    contact: { name: '', email: '' },
    status: 'active',
  };

  it('нормализует бронь Avito в модель DHP', () => {
    const n = adapter.parseBooking(booking);
    expect(n).toMatchObject({
      externalBookingId: '2784166209049096851',
      remoteRoomTypeId: '8071054747',
      remotePropertyId: '355873322',
      arrivalDate: '2026-07-30',
      departureDate: '2026-07-31',
      adults: 2,
      children: 0,
      totalAmount: 22713,
      currency: 'RUB',
      paymentCollectMode: 'channel',
    });
  });

  it('без avito_booking_id → ошибка', () => {
    expect(() => adapter.parseBooking({ ...booking, avito_booking_id: undefined })).toThrow();
  });

  it('без item_id → ошибка (некуда маппить категорию)', () => {
    expect(() => adapter.parseBooking({ ...booking, item_id: undefined })).toThrow();
  });

  it('пустой контакт не роняет парсер (Avito скрывает ПДн)', () => {
    const n = adapter.parseBooking(booking);
    expect(n.guest.firstName).toBeUndefined();
  });
});

describe('AvitoChannelAdapter.parseCancellation / isCanceled', () => {
  it('canceled → распознаётся', () => {
    expect(AvitoChannelAdapter.isCanceled('canceled')).toBe(true);
    expect(AvitoChannelAdapter.isCanceled('active')).toBe(false);
  });
  it('parseCancellation достаёт id', () => {
    expect(adapter.parseCancellation({ avito_booking_id: '999' })).toMatchObject({ externalBookingId: '999' });
  });
});

describe('AvitoChannelAdapter push — по умолчанию не трогает боевые объявления', () => {
  it('pushMode off → skipped success (очередь не в dead-letter)', async () => {
    const r = await adapter.pushAvailability(ctx({ pushMode: 'off' }), {});
    expect(r.ok).toBe(true);
    expect(r.response).toMatchObject({ skipped: true, reason: 'push_disabled' });
  });

  it('без pushMode → тоже off', async () => {
    const r = await adapter.pushRates(ctx(null), {});
    expect(r.response).toMatchObject({ reason: 'push_disabled' });
  });

  it('pushMode live → not_implemented (пока не пишем в Avito), но ok', async () => {
    const r = await adapter.pushRestrictions(ctx({ pushMode: 'live' }), {});
    expect(r.ok).toBe(true);
    expect(r.response).toMatchObject({ reason: 'push_not_implemented' });
  });
});
