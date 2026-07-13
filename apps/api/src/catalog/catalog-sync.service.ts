import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { BnovoPort } from '../integrations/bnovo/bnovo.port.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { toPropertyData, toRoomTypeData } from './catalog.mapper.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Синхронизация каталога из Bnovo в нашу БД (§14.2–14.3).
 * Bnovo — источник истины; пишем журнал и повторяем попытки при сбоях.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bnovo: BnovoPort,
    private readonly tenant: TenantService,
  ) {}

  /** Полная синхронизация объектов и категорий. Возвращает число обработанных элементов. */
  async syncCatalog(): Promise<number> {
    const log = await this.prisma.integrationSyncLog.create({
      data: { integration: 'bnovo', operation: 'sync_catalog', status: 'running' },
    });

    try {
      const itemsSynced = await this.withRetry(() => this.doSync());
      await this.prisma.integrationSyncLog.update({
        where: { id: log.id },
        data: { status: 'success', itemsSynced, finishedAt: new Date() },
      });
      this.logger.log(`Каталог Bnovo синхронизирован: ${itemsSynced} элементов`);
      return itemsSynced;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.integrationSyncLog.update({
        where: { id: log.id },
        data: { status: 'error', message, finishedAt: new Date() },
      });
      this.logger.error(`Ошибка синхронизации каталога Bnovo: ${message}`);
      throw err;
    }
  }

  private async doSync(): Promise<number> {
    const tenantId = await this.tenant.getDefaultTenantId();
    const properties = await this.bnovo.listProperties();
    let count = 0;

    for (const p of properties) {
      const data = toPropertyData(p, tenantId);
      const property = await this.prisma.property.upsert({
        where: { bnovoId: p.id },
        create: { bnovoId: p.id, ...data },
        update: data,
      });
      count += 1;

      const roomTypes = await this.bnovo.listRoomTypes(p.id);
      for (const r of roomTypes) {
        const roomData = toRoomTypeData(r, property.id, tenantId);
        await this.prisma.roomType.upsert({
          where: { bnovoId: r.id },
          create: { bnovoId: r.id, ...roomData },
          // Контент карточки (фото/описание/удобства/площадь/название) редактируется в
          // админке и НЕ перезаписывается синхронизацией; обновляем лишь привязку/активность.
          update: { propertyId: property.id, active: true },
        });
        count += 1;
      }
    }
    return count;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        this.logger.warn(`Синхронизация: попытка ${attempt}/${MAX_RETRIES} не удалась`);
        if (attempt < MAX_RETRIES) await this.delay(RETRY_DELAY_MS * attempt);
      }
    }
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
