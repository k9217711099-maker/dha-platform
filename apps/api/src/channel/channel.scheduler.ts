import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ChannelSyncService } from './channel-sync.service.js';
import { AvitoPollService } from './adapters/avito/avito-poll.service.js';

/** Период входящего поллинга броней Avito (нет вебхука — тянем сами). */
const AVITO_POLL_INTERVAL_MS = 10 * 60_000;

/**
 * Обработчик очереди синхронизации каналов (на БД + @nestjs/schedule, без Redis/BullMQ).
 * Каждые 30 секунд берёт готовые задачи (PENDING + запланированные ретраи) и выгружает в каналы.
 * Отдельным интервалом тянет входящие брони Avito (у площадки нет вебхука на брони).
 */
@Injectable()
export class ChannelScheduler {
  private readonly logger = new Logger(ChannelScheduler.name);

  constructor(
    private readonly sync: ChannelSyncService,
    private readonly avitoPoll: AvitoPollService,
  ) {}

  @Interval('channel-sync-process', 30_000)
  async process(): Promise<void> {
    try {
      const res = await this.sync.processPending();
      if (res.processed > 0) this.logger.log(`Синхронизация каналов: обработано ${res.processed} (успех ${res.success}, ошибок ${res.failed})`);
    } catch (err) {
      this.logger.error('Обработка очереди синхронизации не удалась', err as Error);
    }
  }

  @Interval('channel-avito-poll', AVITO_POLL_INTERVAL_MS)
  async pollAvito(): Promise<void> {
    try {
      const results = await this.avitoPoll.pollAll();
      const total = results.reduce((s, r) => s + r.ingested + r.cancelled, 0);
      if (total > 0) this.logger.log(`Avito поллинг: заведено/отменено ${total} по ${results.length} каналам`);
    } catch (err) {
      this.logger.error('Поллинг броней Avito не удался', err as Error);
    }
  }
}
