import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ChannelSyncService } from './channel-sync.service.js';

/**
 * Обработчик очереди синхронизации каналов (на БD + @nestjs/schedule, без Redis/BullMQ).
 * Каждые 30 секунд берёт готовые задачи (PENDING + запланированные ретраи) и выгружает в каналы.
 */
@Injectable()
export class ChannelScheduler {
  private readonly logger = new Logger(ChannelScheduler.name);

  constructor(private readonly sync: ChannelSyncService) {}

  @Interval('channel-sync-process', 30_000)
  async process(): Promise<void> {
    try {
      const res = await this.sync.processPending();
      if (res.processed > 0) this.logger.log(`Синхронизация каналов: обработано ${res.processed} (успех ${res.success}, ошибок ${res.failed})`);
    } catch (err) {
      this.logger.error('Обработка очереди синхронизации не удалась', err as Error);
    }
  }
}
