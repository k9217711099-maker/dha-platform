import { Module } from '@nestjs/common';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { MockChannelAdapter } from './adapters/mock-channel.adapter.js';
import { ChannelAdapterRegistry } from './adapters/channel-adapter.registry.js';
import { AvitoChannelAdapter } from './adapters/avito/avito-channel.adapter.js';
import { AvitoHttpClient } from './adapters/avito/avito-http.client.js';
import { AvitoPollService } from './adapters/avito/avito-poll.service.js';
import { ChannelService } from './channel.service.js';
import { ChannelSyncService } from './channel-sync.service.js';
import { ChannelIngestionService } from './channel-ingestion.service.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelIngestionController } from './channel-ingestion.controller.js';
import { ChannelScheduler } from './channel.scheduler.js';

/**
 * Channel Manager (Путь B, DHP §20). AvailabilityService/TenantService/PmsBookingService
 * приходят из @Global PmsModule. Приём OTA-броней идёт через PmsBookingService (не в обход
 * анти-овербукинга); очередь синка — на БД, сбой синка не ломает PMS. Адаптеры каналов
 * (mock, Avito) выбираются через ChannelAdapterRegistry. Брони Avito тянутся поллингом.
 */
@Module({
  controllers: [ChannelsController, ChannelIngestionController],
  providers: [
    ChannelService,
    ChannelSyncService,
    ChannelIngestionService,
    MockChannelAdapter,
    AvitoChannelAdapter,
    AvitoHttpClient,
    AvitoPollService,
    ChannelAdapterRegistry,
    ChannelScheduler,
    AuditService,
  ],
})
export class ChannelModule {}
