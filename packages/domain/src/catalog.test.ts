import { describe, expect, it } from 'vitest';
import {
  isHotelProperty,
  isPriceInRanges,
  priceLevelIndicator,
  PropertyType,
} from './catalog.js';

describe('isHotelProperty (привилегии «только отели сети»)', () => {
  it('отели и бутик-отели — да, апартаменты — нет', () => {
    expect(isHotelProperty(PropertyType.HOTEL)).toBe(true);
    expect(isHotelProperty(PropertyType.BOUTIQUE_HOTEL)).toBe(true);
    expect(isHotelProperty(PropertyType.STUDIO)).toBe(false);
    expect(isHotelProperty(PropertyType.TWO_BEDROOM)).toBe(false);
  });
});

describe('isPriceInRanges (§6.3)', () => {
  it('пустой фильтр пропускает любую цену', () => {
    expect(isPriceInRanges(9999, [])).toBe(true);
  });

  it('p2: 5000–10000 ₽', () => {
    expect(isPriceInRanges(7000, ['p2'])).toBe(true);
    expect(isPriceInRanges(4999, ['p2'])).toBe(false);
    expect(isPriceInRanges(10000, ['p2'])).toBe(false); // верхняя граница исключается
  });

  it('верхний диапазон p5 без верхней границы', () => {
    expect(isPriceInRanges(100000, ['p5'])).toBe(true);
  });

  it('несколько диапазонов', () => {
    expect(isPriceInRanges(3000, ['p1', 'p4'])).toBe(true); // p1: 0–5000
    expect(isPriceInRanges(25000, ['p1', 'p4'])).toBe(true); // p4: 20000–40000
    expect(isPriceInRanges(15000, ['p1', 'p4'])).toBe(false); // 15000 — это p3
    expect(isPriceInRanges(12000, ['p1', 'p2'])).toBe(false);
  });
});

describe('priceLevelIndicator', () => {
  it('повторяет символ ₽ по уровню', () => {
    expect(priceLevelIndicator(3)).toBe('₽₽₽');
  });
});
