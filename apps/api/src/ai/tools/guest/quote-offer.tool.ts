import { Injectable } from '@nestjs/common';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { asInt, asString } from '../tool-args.util.js';
import { BookingEngineService } from '../../../booking-engine/booking-engine.service.js';

/**
 * Точный расчёт цены выбранного варианта (тариф + промокод + баллы лояльности).
 * Требует авторизованного гостя (лояльность привязана к аккаунту). Вызывать после
 * search_offers, когда гость выбрал категорию и тариф.
 */
@Injectable()
export class QuoteOfferTool extends AgentTool {
  readonly name = 'quote_offer';
  readonly description =
    'Рассчитать точную цену выбранного варианта (тариф + промокод + баллы лояльности) для авторизованного гостя. Вызывай после search_offers, когда гость выбрал категорию, тариф и даты.';
  readonly parameters = {
    type: 'object',
    properties: {
      propertyId: { type: 'string' },
      roomTypeId: { type: 'string' },
      ratePlanId: { type: 'string' },
      checkIn: { type: 'string', description: 'YYYY-MM-DD' },
      checkOut: { type: 'string', description: 'YYYY-MM-DD' },
      guests: { type: 'integer', minimum: 1 },
      promoCode: { type: 'string' },
      pointsToRedeem: { type: 'integer', minimum: 0, description: 'Сколько баллов списать' },
    },
    required: ['propertyId', 'roomTypeId', 'ratePlanId', 'checkIn', 'checkOut'],
    additionalProperties: false,
  };

  constructor(private readonly engine: BookingEngineService) {
    super();
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.guestId) {
      return {
        content:
          'Чтобы рассчитать точную цену с учётом лояльности и оформить бронь, гостю нужно войти в аккаунт или зарегистрироваться. Предложи войти.',
      };
    }
    const propertyId = asString(args.propertyId);
    const roomTypeId = asString(args.roomTypeId);
    const ratePlanId = asString(args.ratePlanId);
    const checkIn = asString(args.checkIn);
    const checkOut = asString(args.checkOut);
    if (!propertyId || !roomTypeId || !ratePlanId || !checkIn || !checkOut) {
      return { content: 'Не хватает данных: нужны объект, категория, тариф и даты.', isError: true };
    }

    try {
      const q = await this.engine.quote(ctx.guestId, {
        propertyId,
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        guests: asInt(args.guests),
        promoCode: asString(args.promoCode),
        pointsToRedeem: asInt(args.pointsToRedeem),
      });
      const parts = [`проживание ${q.totalPrice} ₽`];
      if (q.promo.applied) parts.push(`промокод −${q.promo.discountRub} ₽`);
      if (q.loyalty.redeemDiscountRub > 0) parts.push(`баллами −${q.loyalty.redeemDiscountRub} ₽`);
      return {
        content: `К оплате ${q.payableAmount} ₽ (${parts.join(', ')}). Доступно баллов: ${q.loyalty.availableBalance}. Оформляем бронь?`,
        data: { payableAmount: q.payableAmount, totalPrice: q.totalPrice },
      };
    } catch (err) {
      return {
        content: `Не удалось рассчитать цену: ${(err as Error).message}. Предложи уточнить даты/тариф или подключи администратора.`,
        isError: true,
      };
    }
  }
}
