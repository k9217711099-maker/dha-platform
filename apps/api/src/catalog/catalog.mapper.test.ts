import { describe, expect, it } from 'vitest';
import { District, PropertyType } from '@prisma/client';
import { mapDistrict, mapPropertyType, toPropertyData } from './catalog.mapper.js';
import type { BnovoProperty } from '../integrations/bnovo/bnovo.types.js';

describe('ACL: маппинг типа объекта', () => {
  it('переводит известные типы Bnovo', () => {
    expect(mapPropertyType('studio')).toBe(PropertyType.STUDIO);
    expect(mapPropertyType('2br')).toBe(PropertyType.TWO_BEDROOM);
    expect(mapPropertyType('boutique_hotel')).toBe(PropertyType.BOUTIQUE_HOTEL);
  });

  it('бросает ошибку на неизвестном типе', () => {
    expect(() => mapPropertyType('villa')).toThrow();
  });
});

describe('ACL: маппинг района', () => {
  it('переводит известные районы, иначе null', () => {
    expect(mapDistrict('nevsky')).toBe(District.NEVSKY_PROSPECT);
    expect(mapDistrict('unknown')).toBeNull();
    expect(mapDistrict(undefined)).toBeNull();
  });
});

describe('ACL: toPropertyData', () => {
  it('переносит поля и нормализует тип/район', () => {
    const bnovo: BnovoProperty = {
      id: 'b1',
      name: 'Тест',
      type: 'studio',
      district: 'golden_triangle',
      address: 'адрес',
      amenities: ['wifi'],
      features: ['balcony'],
      photos: [],
    };
    const data = toPropertyData(bnovo, 't1');
    expect(data.type).toBe(PropertyType.STUDIO);
    expect(data.tenantId).toBe('t1');
    expect(data.district).toBe(District.GOLDEN_TRIANGLE);
    expect(data.name).toBe('Тест');
    expect(data.amenities).toEqual(['wifi']);
    expect(data.active).toBe(true);
  });
});
