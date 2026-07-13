import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { LoyaltyService } from './loyalty.service.js';

/**
 * Ежедневная обработка лояльности (§13.6–13.7): завершение проживаний
 * (баллы PENDING→AVAILABLE) и сгорание просроченных баллов.
 */
@Injectable()
export class LoyaltyScheduler implements OnModuleInit {
  private readonly logger = new Logger(LoyaltyScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly loyalty: LoyaltyService,
  ) {}

  onModuleInit(): void {
    const job = new CronJob('0 0 3 * * *', () => void this.run());
    this.registry.addCronJob('loyalty-daily', job);
    job.start();
  }

  private async run(): Promise<void> {
    try {
      const settled = await this.loyalty.settleCompletedStays();
      const expired = await this.loyalty.expirePoints();
      this.logger.log(`Лояльность: завершено проживаний ${settled}, сгорело партий ${expired}`);
    } catch (err) {
      this.logger.error('Ошибка обработки лояльности', err as Error);
    }
  }
}
