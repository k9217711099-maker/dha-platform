import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AvailabilityService } from './availability.service.js';

/**
 * Авто-истечение инвентарных локов (DHP Availability §8: lock must expire automatically).
 * Каждую минуту помечает просроченные ACTIVE-локи как EXPIRED, возвращая их доступность.
 * (В расчёте availability истёкшие локи и так отсекаются по expiresAt — это уборка статуса.)
 */
@Injectable()
export class AvailabilityScheduler {
  private readonly logger = new Logger(AvailabilityScheduler.name);

  constructor(private readonly availability: AvailabilityService) {}

  @Interval('inventory-lock-cleanup', 60_000)
  async cleanupExpiredLocks(): Promise<void> {
    try {
      const count = await this.availability.cleanupExpiredLocks();
      if (count > 0) this.logger.log(`Инвентарных локов помечено истёкшими: ${count}`);
    } catch (err) {
      this.logger.error('Очистка истёкших инвентарных локов не удалась', err as Error);
    }
  }
}
