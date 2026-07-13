import { describe, expect, it } from 'vitest';
import { NotificationChannel } from '@dha/domain';
import { SCENARIOS } from './scenarios.js';

describe('реестр сценариев уведомлений (§16)', () => {
  it('подтверждение брони: push + email, рендер текста', () => {
    const def = SCENARIOS.BOOKING_CONFIRMED;
    expect(def.channels).toContain(NotificationChannel.PUSH);
    expect(def.channels).toContain(NotificationChannel.EMAIL);
    const { title, body } = def.render({ property: 'D Studio', checkIn: '2026-07-01', checkOut: '2026-07-03' });
    expect(title).toMatch(/подтвержд/i);
    expect(body).toContain('D Studio');
  });

  it('персональное предложение помечено как маркетинговое', () => {
    expect(SCENARIOS.PERSONAL_OFFER.marketing).toBe(true);
  });

  it('код авторизации/чек — без маркетинга', () => {
    expect(SCENARIOS.PAYMENT_RECEIPT.marketing).toBeUndefined();
  });
});
