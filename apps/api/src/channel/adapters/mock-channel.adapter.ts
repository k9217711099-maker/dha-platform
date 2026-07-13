import { BadRequestException, Injectable } from '@nestjs/common';
import { ChannelAdapter } from './channel-adapter.port.js';
import type { ChannelContext, NormalizedBooking, NormalizedCancellation, SyncResult } from '../channel.types.js';

/**
 * Mock-адаптер канала для разработки/тестов. Выгрузка «принимается» без реального вызова
 * OTA; для проверки ретраев канал с `credentials.mode === 'fail'` возвращает ошибку.
 * Нормализует входящий payload (snake_case OTA → модель DHP).
 */
@Injectable()
export class MockChannelAdapter extends ChannelAdapter {
  private push(ctx: ChannelContext, operation: string, payload: unknown): SyncResult {
    if (ctx.credentials?.mode === 'fail') {
      return { ok: false, errorCode: 'remote_server_error', retryable: true };
    }
    return { ok: true, response: { accepted: true, operation, items: this.size(payload), at: new Date().toISOString() } };
  }

  private size(payload: unknown): number {
    const p = payload as { roomTypes?: unknown[] } | null;
    return Array.isArray(p?.roomTypes) ? p.roomTypes.length : 0;
  }

  async pushAvailability(ctx: ChannelContext, payload: unknown): Promise<SyncResult> {
    return this.push(ctx, 'availability', payload);
  }
  async pushRates(ctx: ChannelContext, payload: unknown): Promise<SyncResult> {
    return this.push(ctx, 'rates', payload);
  }
  async pushRestrictions(ctx: ChannelContext, payload: unknown): Promise<SyncResult> {
    return this.push(ctx, 'restrictions', payload);
  }

  parseBooking(raw: unknown): NormalizedBooking {
    const b = (raw ?? {}) as Record<string, any>;
    const g = (b.guest ?? {}) as Record<string, any>;
    const externalBookingId = String(b.external_booking_id ?? b.externalBookingId ?? '');
    if (!externalBookingId) throw new BadRequestException({ code: 'validation_failed', message: 'Отсутствует external_booking_id' });
    const arrivalDate = String(b.arrival_date ?? b.arrivalDate ?? '');
    const departureDate = String(b.departure_date ?? b.departureDate ?? '');
    if (!arrivalDate || !departureDate) throw new BadRequestException({ code: 'invalid_dates', message: 'Отсутствуют даты заезда/выезда' });
    return {
      externalBookingId,
      remotePropertyId: String(b.property_id ?? b.remote_property_id ?? ''),
      remoteRoomTypeId: String(b.room_type_id ?? b.remote_room_type_id ?? ''),
      remoteRatePlanId: b.rate_plan_id ? String(b.rate_plan_id) : undefined,
      arrivalDate,
      departureDate,
      adults: Number(b.adults ?? 1),
      children: Number(b.children ?? 0),
      guest: { firstName: g.first_name ?? g.firstName, lastName: g.last_name ?? g.lastName, phone: g.phone, email: g.email },
      totalAmount: Number(b.price?.total ?? b.total_amount ?? 0),
      currency: String(b.price?.currency ?? b.currency ?? 'RUB'),
      paymentCollectMode: String(b.payment?.collect_method ?? b.payment_collect_mode ?? 'channel'),
    };
  }

  parseCancellation(raw: unknown): NormalizedCancellation {
    const b = (raw ?? {}) as Record<string, any>;
    const id = String(b.external_booking_id ?? b.externalBookingId ?? '');
    if (!id) throw new BadRequestException({ code: 'validation_failed', message: 'Отсутствует external_booking_id' });
    return { externalBookingId: id, reason: b.reason ? String(b.reason) : undefined };
  }
}
