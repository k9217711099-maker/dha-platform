import { District, PropertyType, Prisma } from '@prisma/client';
import type { BnovoProperty, BnovoRoomType } from '../integrations/bnovo/bnovo.types.js';

/**
 * Anti-corruption layer: перевод «сырых» данных Bnovo в наши модели.
 * Изолирует систему от изменений внешних форматов Bnovo.
 */

const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  studio: PropertyType.STUDIO,
  '1br': PropertyType.ONE_BEDROOM,
  '2br': PropertyType.TWO_BEDROOM,
  '3br': PropertyType.THREE_BEDROOM,
  hotel: PropertyType.HOTEL,
  boutique_hotel: PropertyType.BOUTIQUE_HOTEL,
};

const DISTRICT_MAP: Record<string, District> = {
  golden_triangle: District.GOLDEN_TRIANGLE,
  nevsky: District.NEVSKY_PROSPECT,
  moscow_station: District.MOSCOW_STATION,
  mariinsky: District.MARIINSKY_NEW_HOLLAND,
  tavrichesky: District.TAVRICHESKY_GARDEN,
};

export function mapPropertyType(bnovoType: string): PropertyType {
  const mapped = PROPERTY_TYPE_MAP[bnovoType.toLowerCase()];
  if (!mapped) throw new Error(`Bnovo: неизвестный тип объекта "${bnovoType}"`);
  return mapped;
}

export function mapDistrict(bnovoDistrict?: string): District | null {
  if (!bnovoDistrict) return null;
  return DISTRICT_MAP[bnovoDistrict.toLowerCase()] ?? null;
}

/** Данные объекта для upsert по bnovoId (tenantId — арендатор-владелец каталога). */
export function toPropertyData(p: BnovoProperty, tenantId: string): Omit<Prisma.PropertyUncheckedCreateInput, 'bnovoId'> {
  return {
    tenantId,
    name: p.name,
    type: mapPropertyType(p.type),
    district: mapDistrict(p.district),
    address: p.address,
    description: p.description ?? null,
    amenities: p.amenities,
    features: p.features,
    photos: p.photos,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    checkInTime: p.checkInTime ?? null,
    checkOutTime: p.checkOutTime ?? null,
    wifiName: p.wifiName ?? null,
    wifiPassword: p.wifiPassword ?? null,
    houseRules: p.houseRules ?? null,
    instructions: p.instructions ?? null,
    active: true,
  };
}

/** Данные категории номера для upsert по bnovoId (propertyId — наш внутренний id). */
export function toRoomTypeData(
  r: BnovoRoomType,
  propertyDbId: string,
  tenantId: string,
): Omit<Prisma.RoomTypeUncheckedCreateInput, 'bnovoId'> {
  return {
    tenantId,
    propertyId: propertyDbId,
    name: r.name,
    capacity: r.capacity,
    bedType: r.bedType ?? null,
    areaSqm: r.areaSqm ?? null,
    description: r.description ?? null,
    amenities: r.amenities,
    photos: r.photos,
    active: true,
  };
}
