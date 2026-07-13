/**
 * Справочники каталога и фильтров подбора (§6.3 ТЗ).
 * Фиксированы в ТЗ, используются фильтрами поиска и карточками объектов.
 */

/** Тип объекта (§6.3). */
export enum PropertyType {
  STUDIO = 'STUDIO',
  ONE_BEDROOM = 'ONE_BEDROOM',
  TWO_BEDROOM = 'TWO_BEDROOM',
  THREE_BEDROOM = 'THREE_BEDROOM',
  HOTEL = 'HOTEL',
  BOUTIQUE_HOTEL = 'BOUTIQUE_HOTEL',
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  [PropertyType.STUDIO]: 'Квартира-студия',
  [PropertyType.ONE_BEDROOM]: 'Квартира с одной спальней',
  [PropertyType.TWO_BEDROOM]: 'Квартира с двумя спальнями',
  [PropertyType.THREE_BEDROOM]: 'Квартира с тремя спальнями',
  [PropertyType.HOTEL]: 'Отель',
  [PropertyType.BOUTIQUE_HOTEL]: 'Бутик-отель',
};

/**
 * Является ли тип объекта «отелем сети» (а не апартаментами/квартирой).
 * Важно для привилегий лояльности «доступно только в отелях сети» (§13.4).
 */
export function isHotelProperty(type: PropertyType): boolean {
  return type === PropertyType.HOTEL || type === PropertyType.BOUTIQUE_HOTEL;
}

/** Район (§6.3). «Невский проспект и рядом» перефразирован по требованию ТЗ. */
export enum District {
  GOLDEN_TRIANGLE = 'GOLDEN_TRIANGLE',
  NEVSKY_PROSPECT = 'NEVSKY_PROSPECT',
  MOSCOW_STATION = 'MOSCOW_STATION',
  MARIINSKY_NEW_HOLLAND = 'MARIINSKY_NEW_HOLLAND',
  TAVRICHESKY_GARDEN = 'TAVRICHESKY_GARDEN',
}

export const DISTRICT_LABELS: Record<District, string> = {
  [District.GOLDEN_TRIANGLE]: 'Золотой треугольник — сердце Санкт-Петербурга',
  [District.NEVSKY_PROSPECT]: 'Невский проспект и историческая часть города',
  [District.MOSCOW_STATION]: 'Московский вокзал',
  [District.MARIINSKY_NEW_HOLLAND]: 'Мариинский театр и Новая Голландия',
  [District.TAVRICHESKY_GARDEN]: 'Таврический сад',
};

/** Вместимость для фильтра (§6.3). */
export enum CapacityFilter {
  ONE = 'ONE',
  TWO = 'TWO',
  THREE = 'THREE',
  FOUR = 'FOUR',
  FIVE_PLUS = 'FIVE_PLUS',
}

export const CAPACITY_LABELS: Record<CapacityFilter, string> = {
  [CapacityFilter.ONE]: '1 гость',
  [CapacityFilter.TWO]: '2 гостя',
  [CapacityFilter.THREE]: '3 гостя',
  [CapacityFilter.FOUR]: '4 гостя',
  [CapacityFilter.FIVE_PLUS]: '5+ гостей',
};

/** Подразделы удобств (§6.3 — «подели на подразделы»). */
export enum AmenityCategory {
  KITCHEN = 'KITCHEN',
  BATHROOM = 'BATHROOM',
  LAUNDRY = 'LAUNDRY',
  CLIMATE_TECH = 'CLIMATE_TECH',
  COMFORT = 'COMFORT',
  BUILDING = 'BUILDING',
  ACCESS = 'ACCESS',
}

export const AMENITY_CATEGORY_LABELS: Record<AmenityCategory, string> = {
  [AmenityCategory.KITCHEN]: 'Кухня',
  [AmenityCategory.BATHROOM]: 'Ванная',
  [AmenityCategory.LAUNDRY]: 'Стирка и глажка',
  [AmenityCategory.CLIMATE_TECH]: 'Климат и техника',
  [AmenityCategory.COMFORT]: 'Комфорт',
  [AmenityCategory.BUILDING]: 'Дом и территория',
  [AmenityCategory.ACCESS]: 'Доступ и заселение',
};

/** Удобство и его подраздел (§6.3). */
export interface AmenityDef {
  code: string;
  label: string;
  category: AmenityCategory;
}

export const AMENITIES: readonly AmenityDef[] = [
  // Кухня
  { code: 'kitchen', label: 'Кухня', category: AmenityCategory.KITCHEN },
  { code: 'kitchenette', label: 'Мини-кухня', category: AmenityCategory.KITCHEN },
  { code: 'dishwasher', label: 'Посудомоечная машина', category: AmenityCategory.KITCHEN },
  { code: 'coffee_machine', label: 'Кофемашина', category: AmenityCategory.KITCHEN },
  { code: 'cooktop', label: 'Варочная поверхность', category: AmenityCategory.KITCHEN },
  { code: 'oven', label: 'Духовой шкаф', category: AmenityCategory.KITCHEN },
  { code: 'microwave', label: 'СВЧ', category: AmenityCategory.KITCHEN },
  // Ванная
  { code: 'bathtub', label: 'Ванна', category: AmenityCategory.BATHROOM },
  { code: 'shower', label: 'Душ', category: AmenityCategory.BATHROOM },
  { code: 'hairdryer', label: 'Фен', category: AmenityCategory.BATHROOM },
  // Стирка и глажка
  { code: 'washer', label: 'Стиральная машина', category: AmenityCategory.LAUNDRY },
  { code: 'ironing_board', label: 'Гладильная доска', category: AmenityCategory.LAUNDRY },
  { code: 'iron', label: 'Утюг', category: AmenityCategory.LAUNDRY },
  // Климат и техника
  { code: 'air_conditioner', label: 'Кондиционер', category: AmenityCategory.CLIMATE_TECH },
  { code: 'smart_tv', label: 'Smart TV', category: AmenityCategory.CLIMATE_TECH },
  { code: 'wifi', label: 'Wi-Fi', category: AmenityCategory.CLIMATE_TECH },
  { code: 'workspace', label: 'Рабочее место', category: AmenityCategory.CLIMATE_TECH },
  // Комфорт
  { code: 'premium_mattress', label: 'Премиальный матрас', category: AmenityCategory.COMFORT },
  { code: 'safe', label: 'Сейф', category: AmenityCategory.COMFORT },
  { code: 'wine_glasses', label: 'Бокалы для вина', category: AmenityCategory.COMFORT },
  { code: 'baby_cot', label: 'Детская кроватка', category: AmenityCategory.COMFORT },
  // Дом и территория
  { code: 'elevator', label: 'Лифт', category: AmenityCategory.BUILDING },
  { code: 'parking', label: 'Парковка', category: AmenityCategory.BUILDING },
  // Доступ и заселение
  { code: 'contactless_checkin', label: 'Бесконтактное заселение', category: AmenityCategory.ACCESS },
  { code: 'digital_key', label: 'Цифровой ключ', category: AmenityCategory.ACCESS },
] as const;

/** Характеристики объекта (§6.3). */
export const PROPERTY_FEATURES: readonly { code: string; label: string }[] = [
  { code: 'quiet_yard', label: 'Тихий двор' },
  { code: 'street_view', label: 'Вид на улицу' },
  { code: 'high_floor', label: 'Высокий этаж' },
  { code: 'balcony', label: 'Балкон' },
  { code: 'historic_building', label: 'Исторический дом' },
  { code: 'designer_interior', label: 'Дизайнерский интерьер' },
  { code: 'two_bathrooms', label: 'Два санузла' },
  { code: 'premium_finish', label: 'Премиальная отделка' },
  { code: 'high_ceilings', label: 'Высокие потолки' },
] as const;

/**
 * Пять ценовых диапазонов с индикатором стоимости (§6.3 — «иконка доллара»).
 * Границы — за ночь, в рублях; финальные значения настраиваются в админ-панели.
 */
export interface PriceRange {
  code: string;
  /** Уровень 1..5 — для индикатора (₽ … ₽₽₽₽₽). */
  level: 1 | 2 | 3 | 4 | 5;
  /** Нижняя граница за ночь, ₽ (включительно). */
  minRub: number;
  /** Верхняя граница за ночь, ₽ (исключая); null — без верхней границы. */
  maxRub: number | null;
}

export const PRICE_RANGES: readonly PriceRange[] = [
  { code: 'p1', level: 1, minRub: 0, maxRub: 5000 },
  { code: 'p2', level: 2, minRub: 5000, maxRub: 10000 },
  { code: 'p3', level: 3, minRub: 10000, maxRub: 20000 },
  { code: 'p4', level: 4, minRub: 20000, maxRub: 40000 },
  { code: 'p5', level: 5, minRub: 40000, maxRub: null },
] as const;

/** Индикатор уровня цены символами (₽). */
export function priceLevelIndicator(level: PriceRange['level']): string {
  return '₽'.repeat(level);
}

/** Найти ценовой диапазон по коду. */
export function priceRangeByCode(code: string): PriceRange | undefined {
  return PRICE_RANGES.find((r) => r.code === code);
}

/**
 * Попадает ли стоимость за ночь в один из выбранных диапазонов (§6.3).
 * Пустой список кодов означает «без фильтра по цене».
 */
export function isPriceInRanges(perNightRub: number, codes: readonly string[]): boolean {
  if (codes.length === 0) return true;
  return PRICE_RANGES.some(
    (r) =>
      codes.includes(r.code) &&
      perNightRub >= r.minRub &&
      (r.maxRub === null || perNightRub < r.maxRub),
  );
}
