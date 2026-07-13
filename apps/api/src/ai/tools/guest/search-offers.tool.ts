import { Injectable } from '@nestjs/common';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { BookingEngineService } from '../../../booking-engine/booking-engine.service.js';

/**
 * Поиск свободных номеров и цен через собственный Booking Engine (§4.5 ТЗ). Только
 * чтение — цены/доступность берутся из PMS, не выдумываются. Оформление брони и
 * оплата (готовит — гость подтверждает) — отдельные инструменты (требуют гостя).
 */
@Injectable()
export class SearchOffersTool extends AgentTool {
  readonly name = 'search_offers';
  readonly description =
    'Найти свободные номера и цены на заданные даты. Возвращает категории с доступностью и тарифами. Даты — в формате YYYY-MM-DD. Вызывай, когда гость спрашивает, что свободно и сколько стоит.';
  readonly parameters = {
    type: 'object',
    properties: {
      checkIn: { type: 'string', description: 'Дата заезда, YYYY-MM-DD' },
      checkOut: { type: 'string', description: 'Дата выезда, YYYY-MM-DD' },
      guests: { type: 'integer', minimum: 1, description: 'Число гостей' },
      propertyId: { type: 'string', description: 'ID объекта (опционально)' },
    },
    required: ['checkIn', 'checkOut'],
    additionalProperties: false,
  };

  constructor(private readonly engine: BookingEngineService) {
    super();
  }

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const checkIn = typeof args.checkIn === 'string' ? args.checkIn : '';
    const checkOut = typeof args.checkOut === 'string' ? args.checkOut : '';
    const guests =
      typeof args.guests === 'number' ? args.guests : Number(args.guests) || undefined;
    const propertyId = typeof args.propertyId === 'string' ? args.propertyId : undefined;

    if (!checkIn || !checkOut) {
      return { content: 'Нужны даты заезда и выезда в формате YYYY-MM-DD.', isError: true };
    }

    let results: Awaited<ReturnType<BookingEngineService['search']>>;
    try {
      results = await this.engine.search({ checkIn, checkOut, guests, propertyId });
    } catch (err) {
      return { content: `Не удалось проверить доступность: ${(err as Error).message}`, isError: true };
    }

    if (results.length === 0) {
      return { content: `На ${checkIn}–${checkOut} свободных вариантов не найдено.` };
    }

    const lines: string[] = [];
    for (const r of results.slice(0, 8)) {
      const best = r.offers[0];
      if (!best) continue;
      lines.push(
        `- ${r.roomTypeName} (${r.propertyName}), свободно ${r.available}, ${r.nights} ноч.: от ${best.totalAmount} ₽ (${best.ratePlanName})`,
      );
    }
    return {
      content: `Свободно на ${checkIn}–${checkOut}:\n${lines.join('\n')}\n\nПредложи гостю подходящий вариант и уточни, оформляем ли бронь.`,
      data: { count: results.length },
    };
  }
}
