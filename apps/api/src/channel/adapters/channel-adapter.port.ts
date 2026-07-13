import type { ChannelContext, NormalizedBooking, NormalizedCancellation, SyncResult } from '../channel.types.js';

/**
 * Контракт адаптера канала (DHP Adapter §4). Новый OTA подключается реализацией этого
 * порта без изменения ядра Channel Manager. В MVP — единый MockChannelAdapter.
 */
export abstract class ChannelAdapter {
  abstract pushAvailability(ctx: ChannelContext, payload: unknown): Promise<SyncResult>;
  abstract pushRates(ctx: ChannelContext, payload: unknown): Promise<SyncResult>;
  abstract pushRestrictions(ctx: ChannelContext, payload: unknown): Promise<SyncResult>;
  abstract parseBooking(raw: unknown): NormalizedBooking;
  abstract parseCancellation(raw: unknown): NormalizedCancellation;
}
