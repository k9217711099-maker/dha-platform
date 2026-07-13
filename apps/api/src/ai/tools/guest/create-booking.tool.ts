import { Injectable } from '@nestjs/common';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { asInt, asString } from '../tool-args.util.js';
import { BookingEngineService } from '../../../booking-engine/booking-engine.service.js';

interface CreateBookingResultShape {
  booking?: { bookingNumber?: string; totalPrice?: number };
  payment?: { confirmationUrl?: string | null; amount?: number } | null;
}

/**
 * Оформить бронь-hold и вернуть ссылку на оплату («готовит — гость подтверждает»
 * оплатой). Требует авторизованного гостя. Идемпотентность — ключ из диалога +
 * параметров (защита от двойной брони при повторном вызове модели). Овербукинг
 * невозможен (анти-овербукинг в PG-транзакции BookingEngineService).
 */
@Injectable()
export class CreateBookingTool extends AgentTool {
  readonly name = 'create_booking';
  readonly description =
    'Оформить бронь-hold и получить ссылку на оплату. Вызывай, когда авторизованный гость подтвердил выбор (объект, категория, тариф, даты, число гостей). Отмены/возвраты/изменение оплаченной брони — только через escalate_to_admin.';
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
      pointsToRedeem: { type: 'integer', minimum: 0 },
    },
    required: ['propertyId', 'roomTypeId', 'ratePlanId', 'checkIn', 'checkOut', 'guests'],
    additionalProperties: false,
  };

  constructor(private readonly engine: BookingEngineService) {
    super();
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.guestId) {
      return {
        content:
          'Для оформления брони гостю нужно войти в аккаунт. Личные и паспортные данные вводятся в защищённой форме, не в чате. Предложи войти или зарегистрироваться.',
      };
    }
    const propertyId = asString(args.propertyId);
    const roomTypeId = asString(args.roomTypeId);
    const ratePlanId = asString(args.ratePlanId);
    const checkIn = asString(args.checkIn);
    const checkOut = asString(args.checkOut);
    const guests = asInt(args.guests);
    if (!propertyId || !roomTypeId || !ratePlanId || !checkIn || !checkOut || !guests) {
      return {
        content: 'Не хватает данных для брони: объект, категория, тариф, даты и число гостей.',
        isError: true,
      };
    }

    // Стабильный ключ идемпотентности из диалога и параметров: повторный вызов не создаёт дубль.
    const idempotencyKey = ['ai', ctx.conversationId, roomTypeId, ratePlanId, checkIn, checkOut].join(
      ':',
    );

    let raw: unknown;
    try {
      raw = await this.engine.createBooking(
        ctx.guestId,
        {
          propertyId,
          roomTypeId,
          ratePlanId,
          checkIn,
          checkOut,
          guests,
          promoCode: asString(args.promoCode),
          pointsToRedeem: asInt(args.pointsToRedeem),
        },
        idempotencyKey,
      );
    } catch (err) {
      return {
        content: `Не удалось оформить бронь: ${(err as Error).message}. Возможно, вариант только что заняли — предложи другой или подключи администратора.`,
        isError: true,
      };
    }

    const res = raw as CreateBookingResultShape;
    const number = res.booking?.bookingNumber ?? '—';
    const url = res.payment?.confirmationUrl ?? null;
    const amount = res.payment?.amount ?? res.booking?.totalPrice;
    const linkPart = url
      ? `Ссылка на оплату: ${url}`
      : 'Ссылку на оплату пришлю отдельно (платёж формируется).';
    return {
      content: `Бронь ${number} создана и держится за гостем${amount ? `, к оплате ${amount} ₽` : ''}. ${linkPart} Оплата подтверждает бронь; без оплаты она автоматически освободится.`,
      data: { bookingNumber: number, confirmationUrl: url },
    };
  }
}
