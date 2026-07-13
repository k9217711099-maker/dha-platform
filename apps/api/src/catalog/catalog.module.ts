import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BnovoModule } from '../integrations/bnovo/bnovo.module.js';
import { ExtrasModule } from '../extras/extras.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { AvailabilityService } from './availability.service.js';
import { SearchService } from './search.service.js';
import { CatalogSyncService } from './catalog-sync.service.js';
import { CatalogScheduler } from './catalog.scheduler.js';
import { CatalogAdminService } from './catalog-admin.service.js';

@Module({
  imports: [AuthModule, BnovoModule, ExtrasModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    AvailabilityService,
    SearchService,
    CatalogSyncService,
    CatalogScheduler,
    CatalogAdminService,
  ],
  exports: [CatalogService, AvailabilityService, SearchService, CatalogSyncService, CatalogAdminService],
})
export class CatalogModule {}
