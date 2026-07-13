import type {
  BnovoAvailabilityQuery,
  BnovoBookingResult,
  BnovoCalendarDay,
  BnovoCalendarQuery,
  BnovoCreateBookingRequest,
  BnovoOffer,
  BnovoProperty,
  BnovoRoomType,
} from './bnovo.types.js';

/**
 * Порт интеграции с Bnovo PMS. Остальная система зависит ТОЛЬКО от этого порта,
 * никогда не обращаясь к Bnovo напрямую (см. CLAUDE.md). Реализации:
 * MockBnovoAdapter (разработка) и HttpBnovoAdapter (реальный API).
 */
export abstract class BnovoPort {
  /** Список объектов размещения. */
  abstract listProperties(): Promise<BnovoProperty[]>;

  /** Категории номеров объекта. */
  abstract listRoomTypes(propertyId: string): Promise<BnovoRoomType[]>;

  /** Доступность, цены и тарифы на даты (источник истины). */
  abstract getAvailability(query: BnovoAvailabilityQuery): Promise<BnovoOffer[]>;

  /** Календарь цен/доступности на диапазон дат (для пикера дат). */
  abstract getPriceCalendar(query: BnovoCalendarQuery): Promise<BnovoCalendarDay[]>;

  /** Создать бронирование в Bnovo (блок 4). */
  abstract createBooking(req: BnovoCreateBookingRequest): Promise<BnovoBookingResult>;

  /** Отменить бронирование (блок 4). */
  abstract cancelBooking(bnovoBookingId: string): Promise<void>;

  /** Текущий статус бронирования (блок 4). */
  abstract getBookingStatus(bnovoBookingId: string): Promise<string>;
}
