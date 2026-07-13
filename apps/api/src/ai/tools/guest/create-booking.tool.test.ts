import { describe, it, expect, vi } from 'vitest';
import { CreateBookingTool } from './create-booking.tool.js';
import type { BookingEngineService } from '../../../booking-engine/booking-engine.service.js';
import type { ToolContext } from '../agent-tool.js';

const args = {
  propertyId: 'p1',
  roomTypeId: 'rt1',
  ratePlanId: 'rp1',
  checkIn: '2026-08-01',
  checkOut: '2026-08-03',
  guests: 2,
};
const anonCtx: ToolContext = { actor: 'guest', conversationId: 'c1', tenantId: 't1' };
const authedCtx: ToolContext = { ...anonCtx, guestId: 'g1' };

describe('CreateBookingTool', () => {
  it('без авторизации направляет войти (данные — через форму, не в чате)', async () => {
    const engine = { createBooking: vi.fn() } as unknown as BookingEngineService;
    const tool = new CreateBookingTool(engine);
    const res = await tool.execute(args, anonCtx);
    expect(res.content).toContain('войти');
    expect(engine.createBooking).not.toHaveBeenCalled();
  });

  it('создаёт бронь с идемпотентным ключом и возвращает ссылку на оплату', async () => {
    const engine = {
      createBooking: vi.fn().mockResolvedValue({
        booking: { bookingNumber: 'DHA-1001', totalPrice: 18000 },
        payment: { confirmationUrl: 'https://pay.example/xyz', amount: 18000 },
      }),
    } as unknown as BookingEngineService;
    const tool = new CreateBookingTool(engine);
    const res = await tool.execute(args, authedCtx);

    expect(res.isError).toBeFalsy();
    expect(res.content).toContain('DHA-1001');
    expect(res.content).toContain('https://pay.example/xyz');
    expect(res.data?.confirmationUrl).toBe('https://pay.example/xyz');
    const call = vi.mocked(engine.createBooking).mock.calls[0];
    expect(call?.[0]).toBe('g1');
    expect(call?.[2]).toBe('ai:c1:rt1:rp1:2026-08-01:2026-08-03'); // стабильный ключ идемпотентности
  });

  it('на ошибке движка (напр. вариант заняли) отдаёт понятное сообщение', async () => {
    const engine = {
      createBooking: vi.fn().mockRejectedValue(new Error('нет доступности')),
    } as unknown as BookingEngineService;
    const tool = new CreateBookingTool(engine);
    const res = await tool.execute(args, authedCtx);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('администратора');
  });
});
