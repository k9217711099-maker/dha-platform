import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { KeysService } from './keys.service.js';

/** Авто-отзыв цифровых ключей с истёкшим окном действия (§9.4), каждые 15 минут. */
@Injectable()
export class KeysScheduler implements OnModuleInit {
  private readonly logger = new Logger(KeysScheduler.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly keys: KeysService,
  ) {}

  onModuleInit(): void {
    const job = new CronJob('0 */15 * * * *', () => void this.run());
    this.registry.addCronJob('keys-auto-revoke', job);
    job.start();
  }

  private async run(): Promise<void> {
    try {
      const revoked = await this.keys.autoRevokeExpired();
      if (revoked > 0) this.logger.log(`Авто-отзыв ключей: ${revoked}`);
    } catch (err) {
      this.logger.error('Ошибка авто-отзыва ключей', err as Error);
    }
  }
}
