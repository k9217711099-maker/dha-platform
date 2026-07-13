import { District, Prisma, PropertyType } from '@prisma/client';

/** Фильтры подбора объекта (§6.3), кроме дат/цены (они применяются по доступности). */
export interface PropertyFilters {
  propertyTypes?: PropertyType[];
  districts?: District[];
  /** Коды удобств — объект должен иметь ВСЕ выбранные. */
  amenities?: string[];
  /** Коды характеристик — объект должен иметь ВСЕ выбранные. */
  features?: string[];
}

/** Построить Prisma-условие выборки объектов по фильтрам (чистая функция). */
export function buildPropertyWhere(f: PropertyFilters): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = { active: true };
  if (f.propertyTypes?.length) where.type = { in: f.propertyTypes };
  if (f.districts?.length) where.district = { in: f.districts };
  if (f.amenities?.length) where.amenities = { hasEvery: f.amenities };
  if (f.features?.length) where.features = { hasEvery: f.features };
  return where;
}
