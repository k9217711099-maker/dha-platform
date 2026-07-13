import { describe, it, expect, vi } from 'vitest';
import { QuoteOfferTool } from './quote-offer.tool.js';
import type { BookingEngineService } from '../../../booking-engine/booking-engine.service.js';
import type { ToolContext } from '../agent-tool.js';

const baseArgs = {
  propertyId: 'p1',
  roomTypeId: 'rt1',
  ratePlanId: 'rp1',
  checkIn: '2026-08-01',
  checkOut: '2026-08-03',
};
const anonCtx: ToolContext = { actor: 'guest', conversationId: 'c1', tenantId: 't1' };
const authedCtx: ToolContext = { ...anonCtx, guestId: 'g1' };

describe('QuoteOfferTool', () => {
  it('без авторизации предлагает войти и не дёргает движок', async () => {
    const engine = { quote: vi.fn() } as unknown as BookingEngineService;
    const tool = new QuoteOfferTool(engine);
    const res = await tool.execute(baseArgs, anonCtx);
    expect(res.content).toContain('войти');
    expect(engine.quote).not.toHaveBeenCalled();
  });

  it('форматирует цену к оплате для авторизованного гостя', async () => {
    const engine = {
      quote: vi.fn().mockResolvedValue({
        totalPrice: 18000,
        payableAmount: 16000,
        promo: { applied: true, discountRub: 1000 },
        loyalty: { availableBalance: 1200, redeemDiscountRub: 1000 },
      }),
    } as unknown as BookingEngineService;
    const tool = new QuoteOfferTool(engine);
    const res = await tool.execute(baseArgs, authedCtx);
    expect(res.isError).toBeFalsy();
    expect(res.content).toContain('16000');
    expect(engine.quote).toHaveBeenCalledWith('g1', expect.objectContaining(baseArgs));
  });
});
