import { BadRequestException, Injectable } from '@nestjs/common';
import { District, PropertyType } from '@prisma/client';
import { isPriceInRanges } from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AvailabilityService, type RoomAvailability } from './availability.service.js';
import { buildPropertyWhere } from './search.filters.js';

export interface SearchInput {
  checkIn: string;
  checkOut: string;
  guests?: number;
  children?: number;
  propertyTypes?: PropertyType[];
  districts?: District[];
  amenities?: string[];
  features?: string[];
  /** Коды ценовых диапазонов (§6.3), фильтр по стоимости за ночь. */
  priceRanges?: string[];
}

export interface PropertySearchResult {
  propertyId: string;
  name: string;
  type: PropertyType;
  district: District | null;
  address: string;
  photos: string[];
  amenities: string[];
  features: string[];
  latitude: number | null;
  longitude: number | null;
  /** Минимальная цена за ночь среди доступных категорий, ₽. */
  fromPrice: number;
  rooms: RoomAvailability[];
}

/** Минимальная цена за ночь по предложению (минимум среди тарифов). */
function bestPerNight(room: RoomAvailability): number {
  return Math.min(...room.ratePlans.map((r) => r.perNight));
}

/** Поиск проживания: фильтры по объекту + доступность/цена из нашего PMS/Rate Engine (§6.2–6.3). */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  async search(input: SearchInput): Promise<PropertySearchResult[]> {
    if (new Date(input.checkOut) <= new Date(input.checkIn)) {
      throw new BadRequestException('Дата выезда должна быть позже даты заезда');
    }

    // 1. Объекты по фильтрам каталога
    const properties = await this.prisma.property.findMany({
      where: buildPropertyWhere(input),
    });
    if (properties.length === 0) return [];
    const allowedIds = new Set(properties.map((p) => p.id));

    // 2. Доступность на даты (источник истины — наш Availability/Rate Engine)
    const rooms = await this.availability.getAvailability({
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      children: input.children,
    });

    // 3. Группировка по объекту + фильтр по цене за ночь
    const priceRanges = input.priceRanges ?? [];
    const roomsByProperty = new Map<string, RoomAvailability[]>();
    for (const room of rooms) {
      if (!allowedIds.has(room.propertyId)) continue;
      if (!isPriceInRanges(bestPerNight(room), priceRanges)) continue;
      const list = roomsByProperty.get(room.propertyId) ?? [];
      list.push(room);
      roomsByProperty.set(room.propertyId, list);
    }

    // 4. Карточки результатов (только объекты с доступными категориями)
    const results: PropertySearchResult[] = [];
    for (const p of properties) {
      const propRooms = roomsByProperty.get(p.id);
      if (!propRooms?.length) continue;
      results.push({
        propertyId: p.id,
        name: p.name,
        type: p.type,
        district: p.district,
        address: p.address,
        photos: p.photos,
        amenities: p.amenities,
        features: p.features,
        latitude: p.latitude,
        longitude: p.longitude,
        fromPrice: Math.min(...propRooms.map(bestPerNight)),
        rooms: propRooms,
      });
    }

    return results.sort((a, b) => a.fromPrice - b.fromPrice);
  }

  /**
   * Просмотр каталога без дат: все объекты по фильтрам с категориями, но без цен/
   * тарифов (они появляются после выбора дат — доступность из нашего Rate Engine).
   */
  async browse(input: {
    propertyTypes?: PropertyType[];
    districts?: District[];
    amenities?: string[];
    features?: string[];
  }): Promise<PropertySearchResult[]> {
    const properties = await this.prisma.property.findMany({
      where: buildPropertyWhere(input),
      include: { roomTypes: { where: { active: true } } },
      orderBy: { name: 'asc' },
    });
    return properties
      .map((p) => ({
        propertyId: p.id,
        name: p.name,
        type: p.type,
        district: p.district,
        address: p.address,
        photos: p.photos,
        amenities: p.amenities,
        features: p.features,
        latitude: p.latitude,
        longitude: p.longitude,
        fromPrice: 0,
        rooms: p.roomTypes.map((rt) => ({
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          propertyId: p.id,
          propertyName: p.name,
          capacity: rt.capacity,
          available: 0,
          nights: 0,
          minNights: 0,
          ratePlans: [],
          photos: rt.photos,
          amenities: rt.amenities,
          areaSqm: rt.areaSqm,
          bedType: rt.bedType,
          description: rt.description,
        })),
      }))
      .filter((r) => r.rooms.length > 0);
  }
}
