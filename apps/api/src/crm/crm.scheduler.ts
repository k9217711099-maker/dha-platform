import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CrmService } from './crm.service.js';

/** Ежедневные напоминания об отзыве (§15.3) в 10:00. */
@Injectable()
export class CrmScheduler implements OnModuleInit {
  private readonly logger = new Logger(CrmScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly crm: CrmService,
  ) {}

  onModuleInit(): void {
    const job = new CronJob('0 0 10 * * *', () => void this.run());
    this.registry.addCronJob('crm-review-reminders', job);
    job.start();
  }

  private async run(): Promise<void> {
    try {
      const sent = await this.crm.sendReviewReminders();
      if (sent > 0) this.logger.log(`Напоминаний об отзыве: ${sent}`);
    } catch (err) {
      this.logger.error('Ошибка напоминаний об отзыве', err as Error);
    }
  }
}
