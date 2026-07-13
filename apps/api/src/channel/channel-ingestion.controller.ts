import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelIngestionService } from './channel-ingestion.service.js';

/**
 * Приём броней/отмен из каналов (DHP §24). Публичный (как payment webhook); подлинность —
 * по токену канала в заголовке `X-Channel-Token`. Брони создаются через PmsBookingService.
 */
@ApiTags('channel-ingestion')
@Controller('v1/channels')
export class ChannelIngestionController {
  constructor(private readonly ingestion: ChannelIngestionService) {}

  @Post(':id/ingest/booking')
  @ApiHeader({ name: 'X-Channel-Token', required: false, description: 'Токен канала (если задан в credentials)' })
  @ApiOperation({ summary: 'Принять бронь из канала (нормализация → анти-овербукинг → PMS)' })
  ingestBooking(@Param('id') id: string, @Body() raw: Record<string, unknown>, @Headers('x-channel-token') token?: string) {
    return this.ingestion.ingestBooking(id, raw, token);
  }

  @Post(':id/ingest/cancellation')
  @ApiHeader({ name: 'X-Channel-Token', required: false })
  @ApiOperation({ summary: 'Принять отмену из канала (освобождает инвентарь)' })
  ingestCancellation(@Param('id') id: string, @Body() raw: Record<string, unknown>, @Headers('x-channel-token') token?: string) {
    return this.ingestion.ingestCancellation(id, raw, token);
  }
}
