import { describe, it, expect, vi } from 'vitest';
import { SearchOffersTool } from './search-offers.tool.js';
import type { BookingEngineService } from '../../../booking-engine/booking-engine.service.js';
import type { ToolContext } from '../agent-tool.js';

const ctx: ToolContext = { actor: 'guest', conversationId: 'c1', tenantId: 't1' };

describe('SearchOffersTool', () => {
  it('форматирует найденные предложения', async () => {
    const engine = {
      search: vi.fn().mockResolvedValue([
        {
          roomTypeName: 'Студия',
          propertyName: 'Полянка',
          available: 3,
          nights: 2,
          offers: [{ ratePlanName: 'Базовый', totalAmount: 18000 }],
        },
      ]),
    } as unknown as BookingEngineService;
    const tool = new SearchOffersTool(engine);

    const res = await tool.execute({ checkIn: '2026-08-01', checkOut: '2026-08-03', guests: 2 }, ctx);

    expect(res.isError).toBeFalsy();
    expect(res.content).toContain('Студия');
    expect(res.content).toContain('18000');
    expect(engine.search).toHaveBeenCalledWith(
      expect.objectContaining({ checkIn: '2026-08-01', checkOut: '2026-08-03', guests: 2 }),
    );
  });

  it('сообщает, если ничего не найдено', async () => {
    const engine = { search: vi.fn().mockResolvedValue([]) } as unknown as BookingEngineService;
    const tool = new SearchOffersTool(engine);
    const res = await tool.execute({ checkIn: '2026-08-01', checkOut: '2026-08-03' }, ctx);
    expect(res.content).toContain('не найдено');
  });

  it('требует даты и не дёргает движок без них', async () => {
    const engine = { search: vi.fn() } as unknown as BookingEngineService;
    const tool = new SearchOffersTool(engine);
    const res = await tool.execute({}, ctx);
    expect(res.isError).toBe(true);
    expect(engine.search).not.toHaveBeenCalled();
  });
});
