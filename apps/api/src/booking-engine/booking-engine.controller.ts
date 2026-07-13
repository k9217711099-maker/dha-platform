import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { BookingEngineService } from './booking-engine.service.js';
import { CreateEngineBookingDto, QuoteEngineDto } from './dto/booking-engine.dto.js';

/**
 * Гостевой Booking Engine (Путь B): расчёт цены и создание брони на собственном PMS.
 * Флоу: quote → create (pending_payment + payment intent) → оплата подтверждает бронь.
 * Список/просмотр/отмена — общие маршруты `/api/bookings` (работают и с бронями движка).
 */
@ApiTags('booking-engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/booking-engine')
export class BookingEngineController {
  constructor(private readonly engine: BookingEngineService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Рассчитать цену: тариф + промокод + лояльность (без создания брони)' })
  quote(@CurrentGuestId() guestId: string, @Body() dto: QuoteEngineDto) {
    return this.engine.quote(guestId, dto);
  }

  @Post('bookings')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Ключ идемпотентности (защита от дублей)' })
  @ApiOperation({ summary: 'Создать бронь (pending_payment) и платёж' })
  createBooking(
    @CurrentGuestId() guestId: string,
    @Body() dto: CreateEngineBookingDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.engine.createBooking(guestId, dto, idempotencyKey);
  }

  @Post('bookings/:id/pay')
  @ApiOperation({ summary: 'Создать платёж по неоплаченной брони (повтор оплаты)' })
  pay(@CurrentGuestId() guestId: string, @Param('id') id: string) {
    return this.engine.pay(guestId, id);
  }
}
