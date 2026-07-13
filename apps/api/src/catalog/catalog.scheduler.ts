import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CatalogSyncService } from './catalog-sync.service.js';
import type { Env } from '../config/env.schema.js';

/**
 * Fallback-поллинг синхронизации каталога (§14.3) по расписанию BNOVO_SYNC_CRON.
 * Дополняет webhooks (добавятся при подключении реального Bnovo API).
 */
@Injectable()
export class CatalogScheduler implements OnModuleInit {
  private readonly logger = new Logger(CatalogScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly sync: CatalogSyncService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const cron = this.config.get('BNOVO_SYNC_CRON', { infer: true });
    const job = new CronJob(cron, () => {
      void this.sync.syncCatalog().catch((err) => this.logger.error('Поллинг синхронизации не удался', err));
    });
    this.registry.addCronJob('bnovo-catalog-sync', job);
    job.start();
    this.logger.log(`Поллинг синхронизации Bnovo запущен (cron: ${cron})`);
  }
}
