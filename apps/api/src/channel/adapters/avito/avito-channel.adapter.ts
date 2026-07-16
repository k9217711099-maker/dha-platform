import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter } from '../channel-adapter.port.js';
import type { ChannelContext, NormalizedBooking, NormalizedCancellation, SyncResult } from '../../channel.types.js';
import { AVITO_STATUS_CANCELED, AvitoCredentials } from './avito.types.js';

/**
 * Адаптер канала Avito (посуточная аренда). Приём броней — поллинг (AvitoPollService),
 * поэтому parseBooking/parseCancellation получают бронь Avito с внедрённым item_id.
 *
 * Выгрузка В Avito (цены/календарь) по умолчанию ВЫКЛЮЧЕНА (credentials.pushMode !== 'live'):
 * пока идёт обкатка, канал только читает брони и не изменяет боевые объявления. При pushMode
 * off push-операции возвращают success со `skipped`, чтобы очередь синка не уходила в dead-letter.
 */
@Injectable()
export class AvitoChannelAdapter extends ChannelAdapter {
  private readonly logger = new Logger(AvitoChannelAdapter.name);

  async pushAvailability(ctx: ChannelContext, payload: unknown): Promise<SyncResult> {
    return this.pushGuard(ctx, 'availability');
  }
  async pushRates(ctx: ChannelContext, payload: unknown): Promise<SyncResult> {
    return this.pushGuard(ctx, 'rates');
  }
  async pushRestrictions(ctx: ChannelContext, payload: unknown): Promise<SyncResult> {
    return this.pushGuard(ctx, 'restrictions');
  }

  /**
   * Пока не включена боевая выгрузка (pushMode !== 'live') — не трогаем объявления Avito,
   * возвращаем успех со `skipped`. Живая запись цен/календаря — отдельным заходом после теста.
   */
  private pushGuard(ctx: ChannelContext, operation: string): SyncResult {
    const mode = (ctx.credentials as Partial<AvitoCredentials> | null)?.pushMode ?? 'off';
    if (mode !== 'live') {
      this.logger.debug(`Avito push ${operation} пропущен (pushMode=${mode})`);
      return { ok: true, response: { skipped: true, reason: 'push_disabled', operation } };
    }
    // Боевая выгрузка в Avito ещё не реализована (нужен date-level календарь/цены). Не бросаем
    // ошибку, чтобы не засорять dead-letter — фиксируем как not_implemented.
    this.logger.warn(`Avito push ${operation}: live-режим ещё не реализован`);
    return { ok: true, response: { skipped: true, reason: 'push_not_implemented', operation } };
  }

  /** Нормализация брони Avito → модель DHP. raw — бронь Avito с внедрёнными item_id/account_id. */
  parseBooking(raw: unknown): NormalizedBooking {
    const b = (raw ?? {}) as Record<string, any>;
    const externalBookingId = String(b.avito_booking_id ?? '');
    if (!externalBookingId) throw new BadRequestException({ code: 'validation_failed', message: 'Отсутствует avito_booking_id' });
    const itemId = String(b.item_id ?? '');
    if (!itemId) throw new BadRequestException({ code: 'validation_failed', message: 'Отсутствует item_id брони Avito' });
    const arrivalDate = String(b.check_in ?? '');
    const departureDate = String(b.check_out ?? '');
    if (!arrivalDate || !departureDate) throw new BadRequestException({ code: 'invalid_dates', message: 'Отсутствуют даты заезда/выезда' });
    const contact = (b.contact ?? {}) as Record<string, any>;
    return {
      externalBookingId,
      // account_id → property-маппинг (опционально), item_id → категория (обязателен).
      remotePropertyId: String(b.account_id ?? ''),
      remoteRoomTypeId: itemId,
      arrivalDate,
      departureDate,
      adults: Math.max(Number(b.guest_count ?? 1), 1),
      children: 0,
      // Avito скрывает контакты гостя до диалога в мессенджере — имя/телефон обычно пустые.
      guest: { firstName: contact.name || undefined, phone: contact.phone || undefined, email: contact.email || undefined },
      totalAmount: Number(b.base_price ?? 0),
      currency: 'RUB',
      // Оплату собирает Avito (safe_deposit) — у нас бронь считается оплаченной каналом.
      paymentCollectMode: 'channel',
    };
  }

  parseCancellation(raw: unknown): NormalizedCancellation {
    const b = (raw ?? {}) as Record<string, any>;
    const id = String(b.avito_booking_id ?? '');
    if (!id) throw new BadRequestException({ code: 'validation_failed', message: 'Отсутствует avito_booking_id' });
    return { externalBookingId: id, reason: b.reason ? String(b.reason) : 'Отмена в Avito' };
  }

  /** Признак отменённой брони Avito (для маршрутизации поллером в ingest/cancel). */
  static isCanceled(status: string): boolean {
    return status === AVITO_STATUS_CANCELED;
  }
}
