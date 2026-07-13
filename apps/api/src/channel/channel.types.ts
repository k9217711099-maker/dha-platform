/** Нормализованная бронь из канала (DHP Adapter §5). */
export interface NormalizedBooking {
  externalBookingId: string;
  remotePropertyId: string;
  remoteRoomTypeId: string;
  remoteRatePlanId?: string;
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string;
  adults: number;
  children: number;
  guest: { firstName?: string; lastName?: string; phone?: string; email?: string };
  totalAmount: number;
  currency: string;
  /** 'channel' — оплату собрал канал; 'pms' — собираем мы. */
  paymentCollectMode: string;
}

export interface NormalizedCancellation {
  externalBookingId: string;
  reason?: string;
}

/** Результат выгрузки в канал. */
export interface SyncResult {
  ok: boolean;
  errorCode?: string;
  retryable?: boolean;
  response?: unknown;
}

/** Контекст канала для адаптера (без прямого доступа к БД). */
export interface ChannelContext {
  channelId: string;
  code: string;
  credentials: Record<string, unknown> | null;
}
