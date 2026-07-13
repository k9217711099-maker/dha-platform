import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { PaymentsService } from './payments.service.js';
import type { Env } from '../config/env.schema.js';

/** Фолбэк-поллинг статусов платежей на случай недоставки webhook (по умолчанию раз в минуту). */
@Injectable()
export class PaymentsScheduler implements OnModuleInit {
  private readonly logger = new Logger(PaymentsScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService<Env, true>,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit(): void {
    const cron = this.config.get('PAYMENT_SYNC_CRON', { infer: true });
    const job = new CronJob(cron, () => void this.run());
    this.registry.addCronJob('payments-sync', job);
    job.start();
    this.logger.log(`Поллинг статусов платежей запущен (cron: ${cron})`);
  }

  private async run(): Promise<void> {
    try {
      const updated = await this.payments.syncPendingPayments();
      if (updated > 0) this.logger.log(`Поллинг платежей: обновлено ${updated}`);
    } catch (err) {
      this.logger.error('Ошибка поллинга платежей', err as Error);
    }
  }
}
