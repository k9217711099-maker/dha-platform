import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { FunnelOrchestratorService } from './funnel-orchestrator.service.js';

/** Тик оркестратора заселения (CHECK-IN-TZ §6) каждые 5 минут — паттерн keys.scheduler. */
@Injectable()
export class FunnelScheduler implements OnModuleInit {
  private readonly logger = new Logger(FunnelScheduler.name);
  private running = false;

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly orchestrator: FunnelOrchestratorService,
  ) {}

  onModuleInit(): void {
    const job = new CronJob('0 */5 * * * *', () => void this.run());
    this.registry.addCronJob('checkin-funnel-tick', job);
    job.start();
  }

  private async run(): Promise<void> {
    if (this.running) return; // тик не накладывается на предыдущий
    this.running = true;
    try {
      const { processed } = await this.orchestrator.tick();
      if (processed > 0) this.logger.log(`Воронка заселения: обработано броней — ${processed}`);
    } catch (err) {
      this.logger.error('Ошибка тика воронки заселения', err as Error);
    } finally {
      this.running = false;
    }
  }
}
