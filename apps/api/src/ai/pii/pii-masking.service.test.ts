import { describe, it, expect } from 'vitest';
import { PiiMaskingService } from './pii-masking.service.js';

const svc = new PiiMaskingService();

describe('PiiMaskingService.mask', () => {
  it('маскирует email, телефон и паспорт', () => {
    const { masked, map } = svc.mask(
      'Здравствуйте, почта ivan@mail.ru, тел +7 921 000-11-22, паспорт 1234 567890',
    );
    expect(masked).not.toContain('ivan@mail.ru');
    expect(masked).not.toContain('567890');
    expect(masked).not.toContain('921');
    expect(masked).toContain('[EMAIL_1]');
    expect(masked).toContain('[PHONE_1]');
    expect(masked).toContain('[PASSPORT_1]');
    expect(Object.keys(map)).toHaveLength(3);
  });

  it('не трогает обычный текст без ПДн', () => {
    const { masked, map } = svc.mask('Есть ли свободные студии на выходные?');
    expect(masked).toBe('Есть ли свободные студии на выходные?');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('нумерует несколько совпадений и обратимо восстанавливает', () => {
    const original = 'почты a@b.ru и c@d.ru';
    const { masked, map } = svc.mask(original);
    expect(masked).toBe('почты [EMAIL_1] и [EMAIL_2]');
    expect(svc.unmask(masked, map)).toBe(original);
  });

  it('маскирует номер карты целиком', () => {
    const { masked } = svc.mask('карта 4276 3800 1234 5678 к оплате');
    expect(masked).toContain('[CARD_1]');
    expect(masked).not.toMatch(/\d{4}/);
  });
});
