import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelSyncJob, Prisma, SyncJobStatus, SyncJobType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AvailabilityService } from '../pms/availability/availability.service.js';
import { MockChannelAdapter } from './adapters/mock-channel.adapter.js';
import type { ChannelContext } from './channel.types.js';

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 3_600_000;
const AVAILABILITY_WINDOW_DAYS = 14;

/**
 * Очередь синхронизации в каналы на БД (без Redis/BullMQ). Задачи ставятся на изменение
 * инвентаря/цен, обрабатываются планировщиком; при ошибке — ретрай с экспоненциальной
 * задержкой, при исчерпании — DEAD_LETTER. Всё логируется; сбой синка НЕ ломает PMS.
 */
@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly adapter: MockChannelAdapter,
  ) {}

  // ─── Постановка задач ───
  async enqueue(tenantId: string, channelId: string, jobType: SyncJobType, propertyId?: string, payload?: Prisma.InputJsonValue) {
    return this.prisma.channelSyncJob.create({
      data: { tenantId, channelId, jobType, propertyId: propertyId ?? null, status: 'PENDING', payload: payload ?? undefined },
    });
  }

  /**
   * Хук inventory.changed / rate.changed: поставить синк по объекту во все активные каналы
   * (кроме источника). НИКОГДА не бросает — сбой постановки не должен ломать бронь.
   */
  async enqueueForProperty(tenantId: string, propertyId: string, jobType: SyncJobType, exceptChannelId?: string): Promise<number> {
    try {
      const maps = await this.prisma.channelPropertyMapping.findMany({
        where: { tenantId, propertyId, channelId: exceptChannelId ? { not: exceptChannelId } : undefined },
        include: { channel: { select: { active: true } } },
      });
      let count = 0;
      for (const m of maps) {
        if (!m.channel.active) continue;
        await this.enqueue(tenantId, m.channelId, jobType, propertyId);
        count += 1;
      }
      return count;
    } catch (err) {
      this.logger.warn(`Постановка синка по объекту ${propertyId} не удалась (не влияет на бронь): ${(err as Error).message}`);
      return 0;
    }
  }

  // ─── Обработка ───
  /** Обработать порцию готовых задач (планировщик + ручной запуск). Возвращает счётчики. */
  async processPending(limit = 20): Promise<{ processed: number; success: number; failed: number }> {
    const jobs = await this.prisma.channelSyncJob.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'RETRY_SCHEDULED', nextRetryAt: { lte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let success = 0;
    let failed = 0;
    for (const job of jobs) {
      const ok = await this.processJob(job);
      ok ? (success += 1) : (failed += 1);
    }
    return { processed: jobs.length, success, failed };
  }

  private async processJob(job: ChannelSyncJob): Promise<boolean> {
    const channel = await this.prisma.channel.findUnique({ where: { id: job.channelId } });
    if (!channel || !channel.active) {
      await this.prisma.channelSyncJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', errorCode: 'channel_inactive' } });
      return false;
    }
    await this.prisma.channelSyncJob.update({ where: { id: job.id }, data: { status: 'PROCESSING' } });

    const ctx: ChannelContext = { channelId: channel.id, code: channel.code, credentials: (channel.credentials as Record<string, unknown> | null) ?? null };
    const payload = await this.buildPayload(job);

    let result;
    try {
      result = job.jobType === 'RATES'
        ? await this.adapter.pushRates(ctx, payload)
        : job.jobType === 'RESTRICTIONS'
          ? await this.adapter.pushRestrictions(ctx, payload)
          : await this.adapter.pushAvailability(ctx, payload);
    } catch (err) {
      result = { ok: false, errorCode: 'unknown_error', retryable: true, response: { message: (err as Error).message } };
    }

    if (result.ok) {
      await this.prisma.channelSyncJob.update({ where: { id: job.id }, data: { status: 'SUCCESS', response: (result.response ?? undefined) as Prisma.InputJsonValue, errorCode: null } });
      await this.prisma.channel.update({ where: { id: channel.id }, data: { lastSyncAt: new Date() } });
      await this.log(job, 'success', `Выгрузка ${job.jobType} принята каналом`);
      return true;
    }

    // Неуспех: ретрай с backoff или dead-letter.
    const retryCount = job.retryCount + 1;
    const exhausted = retryCount >= job.maxRetries || result.retryable === false;
    await this.prisma.channelSyncJob.update({
      where: { id: job.id },
      data: {
        retryCount,
        errorCode: result.errorCode ?? 'unknown_error',
        status: exhausted ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
        nextRetryAt: exhausted ? null : new Date(Date.now() + this.backoffMs(retryCount)),
      },
    });
    await this.log(job, exhausted ? 'dead_letter' : 'retry_scheduled', `Ошибка ${result.errorCode}; попытка ${retryCount}/${job.maxRetries}`);
    return false;
  }

  /** Ручной повтор задачи (в т.ч. из dead-letter). */
  async retryJob(tenantId: string, id: string) {
    const job = await this.prisma.channelSyncJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Задача синхронизации не найдена');
    const updated = await this.prisma.channelSyncJob.update({ where: { id }, data: { status: 'PENDING', nextRetryAt: null } });
    await this.log(job, 'manual_retry', 'Задача поставлена на повтор вручную');
    return updated;
  }

  private backoffMs(retryCount: number): number {
    return Math.min(BACKOFF_BASE_MS * 2 ** (retryCount - 1), BACKOFF_CAP_MS);
  }

  /** Снимок для выгрузки. Для availability — доступность объекта на ближнее окно. */
  private async buildPayload(job: ChannelSyncJob): Promise<Prisma.InputJsonValue> {
    if (job.jobType === 'AVAILABILITY' && job.propertyId) {
      const from = new Date();
      const to = new Date(from.getTime() + AVAILABILITY_WINDOW_DAYS * 86_400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const snapshot = await this.availability.search(job.tenantId, { propertyId: job.propertyId, checkIn: iso(from), checkOut: iso(to) });
      return { propertyId: job.propertyId, window: { from: iso(from), to: iso(to) }, roomTypes: snapshot.map((r) => ({ roomTypeId: r.roomTypeId, available: r.available })) } as Prisma.InputJsonValue;
    }
    return (job.payload ?? { propertyId: job.propertyId }) as Prisma.InputJsonValue;
  }

  private log(job: ChannelSyncJob, status: string, message: string) {
    return this.prisma.channelSyncLog.create({
      data: { tenantId: job.tenantId, channelId: job.channelId, jobId: job.id, operation: job.jobType, status, message },
    });
  }
}
