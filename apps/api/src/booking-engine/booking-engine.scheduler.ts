import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BookingEngineService } from './booking-engine.service.js';

/**
 * Авто-истечение неоплаченных броней Booking Engine (аналог TTL инвентарного лока):
 * PENDING без оплаты старше TTL освобождают инвентарь. Каждые 5 минут.
 */
@Injectable()
export class BookingEngineScheduler {
  private readonly logger = new Logger(BookingEngineScheduler.name);

  constructor(private readonly engine: BookingEngineService) {}

  @Interval('booking-engine-expire-unpaid', 5 * 60_000)
  async expireUnpaid(): Promise<void> {
    try {
      await this.engine.expireUnpaidBookings();
    } catch (err) {
      this.logger.error('Истечение неоплаченных броней не удалось', err as Error);
    }
  }
}
