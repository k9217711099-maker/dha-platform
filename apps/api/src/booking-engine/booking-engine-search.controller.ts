import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingEngineService } from './booking-engine.service.js';
import { SearchEngineDto } from './dto/booking-engine.dto.js';

/**
 * Публичный поиск Booking Engine (без авторизации) — воронка бронирования до входа.
 * Источник доступности и цен — собственный PMS (Путь B), не Bnovo.
 */
@ApiTags('booking-engine')
@Controller('v1/booking-engine')
export class BookingEngineSearchController {
  constructor(private readonly engine: BookingEngineService) {}

  @Get('search')
  @ApiOperation({ summary: 'Поиск доступных категорий и тарифов на даты' })
  search(@Query() query: SearchEngineDto) {
    return this.engine.search(query);
  }
}
