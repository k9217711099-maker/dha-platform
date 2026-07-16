/**
 * Типы интеграции с Avito (посуточная аренда, Realty/Core API).
 * Секреты берутся из Channel.credentials; в код/логи не попадают.
 */

/** Учётные данные канала Avito (хранятся в Channel.credentials). */
export interface AvitoCredentials {
  provider: 'avito';
  clientId: string;
  clientSecret: string;
  /** Номер аккаунта в кабинете Avito (self.id). */
  userId: number;
  /**
   * Режим выгрузки В Avito (цены/календарь). По умолчанию 'off' — интеграция только
   * ЧИТАЕТ брони из Avito и не трогает боевые объявления. 'live' включает запись.
   */
  pushMode?: 'off' | 'live';
}

/** Бронь Avito как отдаёт Realty API (GET .../items/{item_id}/bookings). */
export interface AvitoBooking {
  /** Большое целое (> 2^53) — храним и передаём строкой, чтобы не потерять точность. */
  avito_booking_id: string;
  base_price: number;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  contact?: { email?: string; name?: string; phone?: string };
  guest_count?: number;
  nights?: number;
  safe_deposit?: { owner_amount?: number; tax?: number; total_amount?: number };
  status: 'active' | 'canceled' | string;
}

/** Бронь Avito с привязкой к объявлению (item_id не входит в тело брони). */
export interface AvitoBookingWithItem extends AvitoBooking {
  item_id: string;
  account_id: string;
}

/** Объявление аккаунта Avito (GET /core/v1/items). */
export interface AvitoItem {
  id: number;
  title?: string;
  address?: string;
  price?: number;
  status?: string;
  url?: string;
  category?: { id: number; name: string };
}

export interface AvitoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export const AVITO_API_BASE = 'https://api.avito.ru';
/** Активная бронь Avito блокирует даты у нас; отменённая — снимает блокировку. */
export const AVITO_STATUS_CANCELED = 'canceled';
