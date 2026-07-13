import { describe, expect, it } from 'vitest';
import { District, PropertyType } from '@prisma/client';
import { buildPropertyWhere } from './search.filters.js';

describe('buildPropertyWhere', () => {
  it('по умолчанию только активные', () => {
    expect(buildPropertyWhere({})).toEqual({ active: true });
  });

  it('фильтр по типам и районам через in', () => {
    const where = buildPropertyWhere({
      propertyTypes: [PropertyType.STUDIO, PropertyType.HOTEL],
      districts: [District.NEVSKY_PROSPECT],
    });
    expect(where.type).toEqual({ in: [PropertyType.STUDIO, PropertyType.HOTEL] });
    expect(where.district).toEqual({ in: [District.NEVSKY_PROSPECT] });
  });

  it('удобства/характеристики через hasEvery (все выбранные)', () => {
    const where = buildPropertyWhere({ amenities: ['wifi', 'kitchen'], features: ['balcony'] });
    expect(where.amenities).toEqual({ hasEvery: ['wifi', 'kitchen'] });
    expect(where.features).toEqual({ hasEvery: ['balcony'] });
  });

  it('пустые массивы игнорируются', () => {
    expect(buildPropertyWhere({ propertyTypes: [], amenities: [] })).toEqual({ active: true });
  });
});
