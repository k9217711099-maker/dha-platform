/**
 * Внешние («сырые») типы данных Bnovo PMS — контракт адаптера.
 * Маппятся в наши доменные модели слоем anti-corruption (catalog.mapper).
 * Реальные поля уточняются по спецификации Bnovo API при подключении ключей.
 */

export interface BnovoProperty {
  id: string;
  name: string;
  /** Тип объекта в терминах Bnovo (маппится в PropertyType). */
  type: string;
  /** Район/локация (маппится в District). */
  district?: string;
  address: string;
  description?: string;
  amenities: string[];
  features: string[];
  photos: string[];
  latitude?: number;
  longitude?: number;
  checkInTime?: string;
  checkOutTime?: string;
  wifiName?: string;
  wifiPassword?: string;
  houseRules?: string;
  instructions?: string;
}

export interface BnovoRoomType {
  id: string;
  propertyId: string;
  name: string;
  capacity: number;
  bedType?: string;
  areaSqm?: number;
  description?: string;
  amenities: string[];
  photos: string[];
}

export interface BnovoAvailabilityQuery {
  propertyId?: string;
  roomTypeId?: string;
  /** Дата заезда (YYYY-MM-DD). */
  checkIn: string;
  /** Дата выезда (YYYY-MM-DD). */
  checkOut: string;
  guests?: number;
}

/** Запрос календаря цен/доступности на диапазон дат (для пикера дат). */
export interface BnovoCalendarQuery {
  propertyId?: string;
  roomTypeId?: string;
  /** Первый день диапазона (YYYY-MM-DD). */
  from: string;
  /** Сколько дней вперёд. */
  days: number;
  guests?: number;
}

/** Один день календаря: минимальная цена за ночь и доступность. */
export interface BnovoCalendarDay {
  /** YYYY-MM-DD. */
  date: string;
  available: boolean;
  /** Минимальная цена за ночь, ₽ (null — нет предложений/закрыто). */
  minNightlyPrice: number | null;
}

export interface BnovoRatePlan {
  id: string;
  name: string;
  /** Итоговая стоимость за весь период, ₽. */
  totalPrice: number;
  /** Средняя стоимость за ночь, ₽. */
  perNight: number;
  /** Возвратный ли тариф. */
  refundable: boolean;
  cancellationPolicy: string;
}

/** Предложение по категории номера на запрошенные даты. */
export interface BnovoOffer {
  roomTypeId: string;
  /** Сколько единиц доступно. */
  available: number;
  nights: number;
  minNights: number;
  ratePlans: BnovoRatePlan[];
}

// --- Бронирование (используется в блоке 4; адаптер реализует заранее) ---

export interface BnovoCreateBookingRequest {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guest: { firstName?: string; lastName?: string; phone?: string; email?: string };
}

export interface BnovoBookingResult {
  bnovoBookingId: string;
  status: string;
  totalPrice: number;
}
