import { Module } from '@nestjs/common';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { MockChannelAdapter } from './adapters/mock-channel.adapter.js';
import { ChannelService } from './channel.service.js';
import { ChannelSyncService } from './channel-sync.service.js';
import { ChannelIngestionService } from './channel-ingestion.service.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelIngestionController } from './channel-ingestion.controller.js';
import { ChannelScheduler } from './channel.scheduler.js';

/**
 * Channel Manager (Путь B, DHP §20). AvailabilityService/TenantService/PmsBookingService
 * приходят из @Global PmsModule. Приём OTA-броней идёт через PmsBookingService (не в обход
 * анти-овербукинга); очередь синка — на БД, сбой синка не ломает PMS.
 */
@Module({
  controllers: [ChannelsController, ChannelIngestionController],
  providers: [ChannelService, ChannelSyncService, ChannelIngestionService, MockChannelAdapter, ChannelScheduler, AuditService],
})
export class ChannelModule {}
