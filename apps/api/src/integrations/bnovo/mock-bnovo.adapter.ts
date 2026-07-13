import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BnovoPort } from './bnovo.port.js';
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

interface MockRoom extends BnovoRoomType {
  /** Базовая цена за ночь, ₽ — для генерации тарифов. */
  basePrice: number;
}

/** Набор фото-заглушек (стабильный picsum по seed) для демонстрации галереи. */
function demoPhotos(prefix: string, n = 5): string[] {
  return Array.from({ length: n }, (_, i) => `https://picsum.photos/seed/${prefix}-${i + 1}/900/600`);
}

/**
 * In-memory реализация Bnovo для разработки и тестов: данные по объектам СПб,
 * генерация доступности/тарифов и эмуляция создания брони.
 * Заменяется на HttpBnovoAdapter после получения ключей API.
 */
@Injectable()
export class MockBnovoAdapter extends BnovoPort {
  private readonly properties: BnovoProperty[] = [
    {
      id: 'bnovo-prop-1',
      name: 'D Studio на Невском',
      type: 'studio',
      district: 'nevsky',
      address: 'Невский проспект, 22',
      description: 'Студия в историческом центре, рядом с Невским проспектом.',
      amenities: ['wifi', 'kitchenette', 'smart_tv', 'air_conditioner', 'contactless_checkin', 'digital_key'],
      features: ['historic_building', 'street_view', 'high_ceilings'],
      photos: demoPhotos('prop-1'),
      latitude: 59.9355,
      longitude: 30.3258,
    },
    {
      id: 'bnovo-prop-2',
      name: 'D Apartments Золотой треугольник',
      type: '2br',
      district: 'golden_triangle',
      address: 'улица Рубинштейна, 5',
      description: 'Двухспальные апартаменты в Золотом треугольнике.',
      amenities: ['wifi', 'kitchen', 'dishwasher', 'washer', 'smart_tv', 'coffee_machine', 'elevator', 'digital_key'],
      features: ['designer_interior', 'quiet_yard', 'two_bathrooms', 'premium_finish'],
      photos: demoPhotos('prop-2'),
      latitude: 59.9311,
      longitude: 30.3471,
    },
    {
      id: 'bnovo-prop-3',
      name: 'D Boutique Hotel Мариинский',
      type: 'boutique_hotel',
      district: 'mariinsky',
      address: 'площадь Тургенева, 1',
      description: 'Бутик-отель рядом с Мариинским театром и Новой Голландией.',
      amenities: ['wifi', 'smart_tv', 'air_conditioner', 'safe', 'hairdryer', 'premium_mattress', 'parking'],
      features: ['historic_building', 'premium_finish', 'designer_interior'],
      photos: demoPhotos('prop-3'),
      latitude: 59.9255,
      longitude: 30.2961,
    },
    {
      id: 'bnovo-prop-4',
      name: 'D Loft у Московского вокзала',
      type: '1br',
      district: 'moscow_station',
      address: 'Лиговский проспект, 30',
      description: 'Однокомнатные апартаменты в шаге от Московского вокзала.',
      amenities: ['wifi', 'kitchenette', 'washer', 'smart_tv', 'workspace', 'elevator', 'contactless_checkin'],
      features: ['high_floor', 'balcony'],
      photos: demoPhotos('prop-4'),
      latitude: 59.9275,
      longitude: 30.3608,
    },
  ];

  private readonly rooms: MockRoom[] = [
    { id: 'bnovo-room-1', propertyId: 'bnovo-prop-1', name: 'Студия', capacity: 2, bedType: 'Queen', areaSqm: 28, amenities: ['wifi', 'smart_tv', 'air_conditioner', 'kitchenette', 'coffee_machine', 'contactless_checkin', 'digital_key', 'hairdryer', 'workspace'], photos: demoPhotos('room-1'), basePrice: 6500 },
    { id: 'bnovo-room-2', propertyId: 'bnovo-prop-2', name: 'Апартаменты с 2 спальнями', capacity: 4, bedType: '2 × Queen', areaSqm: 65, amenities: ['wifi', 'kitchen', 'dishwasher', 'washer', 'smart_tv', 'coffee_machine', 'air_conditioner', 'elevator', 'digital_key', 'workspace', 'hairdryer', 'safe'], photos: demoPhotos('room-2'), basePrice: 14000 },
    { id: 'bnovo-room-3', propertyId: 'bnovo-prop-3', name: 'Стандарт', capacity: 2, bedType: 'King', areaSqm: 24, amenities: ['wifi', 'safe', 'air_conditioner', 'smart_tv', 'hairdryer', 'premium_mattress', 'coffee_machine'], photos: demoPhotos('room-3'), basePrice: 11000 },
    { id: 'bnovo-room-4', propertyId: 'bnovo-prop-3', name: 'Делюкс', capacity: 3, bedType: 'King + диван', areaSqm: 34, amenities: ['wifi', 'premium_mattress', 'safe', 'air_conditioner', 'smart_tv', 'coffee_machine', 'hairdryer', 'parking', 'workspace'], photos: demoPhotos('room-4'), basePrice: 18000 },
    { id: 'bnovo-room-5', propertyId: 'bnovo-prop-4', name: 'Апартаменты с 1 спальней', capacity: 3, bedType: 'Queen + диван', areaSqm: 40, amenities: ['wifi', 'workspace', 'kitchenette', 'washer', 'smart_tv', 'air_conditioner', 'elevator', 'contactless_checkin', 'coffee_machine'], photos: demoPhotos('room-5'), basePrice: 8500 },
  ];

  private readonly bookings = new Map<string, BnovoBookingResult & { req: BnovoCreateBookingRequest }>();

  async listProperties(): Promise<BnovoProperty[]> {
    // Обогащаем практичной информацией для проживания (§7.1)
    return this.properties.map((p) => ({
      checkInTime: '14:00',
      checkOutTime: '12:00',
      wifiName: `DHA-${p.id.slice(-1)}`,
      wifiPassword: 'welcome2026',
      houseRules: 'Не курить. Тишина с 23:00 до 8:00. Без вечеринок.',
      instructions: 'Вход в подъезд по коду, апартамент открывается цифровым ключом из приложения.',
      ...p,
    }));
  }

  async listRoomTypes(propertyId: string): Promise<BnovoRoomType[]> {
    return this.rooms
      .filter((r) => r.propertyId === propertyId)
      .map(({ basePrice: _basePrice, ...room }) => room);
  }

  async getAvailability(query: BnovoAvailabilityQuery): Promise<BnovoOffer[]> {
    const nights = this.nights(query.checkIn, query.checkOut);
    if (nights <= 0) return [];

    return this.rooms
      .filter((r) => (query.propertyId ? r.propertyId === query.propertyId : true))
      .filter((r) => (query.roomTypeId ? r.id === query.roomTypeId : true))
      .filter((r) => (query.guests ? r.capacity >= query.guests : true))
      .map((r) => this.buildOffer(r, nights));
  }

  async getPriceCalendar(query: BnovoCalendarQuery): Promise<BnovoCalendarDay[]> {
    const rooms = this.rooms
      .filter((r) => (query.propertyId ? r.propertyId === query.propertyId : true))
      .filter((r) => (query.roomTypeId ? r.id === query.roomTypeId : true))
      .filter((r) => (query.guests ? r.capacity >= query.guests : true));

    const days: BnovoCalendarDay[] = [];
    const start = new Date(`${query.from}T00:00:00Z`);
    for (let i = 0; i < query.days; i += 1) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay(); // 0=вс … 6=сб
      const weekend = dow === 5 || dow === 6; // пт/сб дороже
      // Несколько закрытых дней для наглядности цветовой доступности.
      const closed = rooms.length === 0 || (d.getUTCDate() % 17 === 0);
      if (closed) {
        days.push({ date: iso, available: false, minNightlyPrice: null });
        continue;
      }
      const min = Math.min(
        ...rooms.map((r) => Math.round(r.basePrice * 0.9 * (weekend ? 1.25 : 1))),
      );
      days.push({ date: iso, available: true, minNightlyPrice: min });
    }
    return days;
  }

  async createBooking(req: BnovoCreateBookingRequest): Promise<BnovoBookingResult> {
    const room = this.rooms.find((r) => r.id === req.roomTypeId);
    if (!room) throw new Error(`Bnovo(mock): категория ${req.roomTypeId} не найдена`);
    const nights = this.nights(req.checkIn, req.checkOut);
    const result: BnovoBookingResult = {
      bnovoBookingId: `bnovo-bk-${randomUUID()}`,
      status: 'confirmed',
      totalPrice: room.basePrice * Math.max(nights, 1),
    };
    this.bookings.set(result.bnovoBookingId, { ...result, req });
    return result;
  }

  async cancelBooking(bnovoBookingId: string): Promise<void> {
    const bk = this.bookings.get(bnovoBookingId);
    if (bk) bk.status = 'cancelled';
  }

  async getBookingStatus(bnovoBookingId: string): Promise<string> {
    return this.bookings.get(bnovoBookingId)?.status ?? 'unknown';
  }

  private buildOffer(room: MockRoom, nights: number): BnovoOffer {
    const standard = room.basePrice;
    const nonRefundable = Math.round(room.basePrice * 0.9);
    return {
      roomTypeId: room.id,
      available: 3,
      nights,
      minNights: 1,
      ratePlans: [
        {
          id: `${room.id}-nonref`,
          name: 'Невозвратный тариф',
          perNight: nonRefundable,
          totalPrice: nonRefundable * nights,
          refundable: false,
          cancellationPolicy: 'Без возврата при отмене',
        },
        {
          id: `${room.id}-standard`,
          name: 'Стандарт (возвратный)',
          perNight: standard,
          totalPrice: standard * nights,
          refundable: true,
          cancellationPolicy: 'Бесплатная отмена за 48 часов до заезда',
        },
      ],
    };
  }

  private nights(checkIn: string, checkOut: string): number {
    const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.round(ms / 86_400_000);
  }
}
