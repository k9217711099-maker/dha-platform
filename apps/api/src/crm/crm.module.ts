import { Module } from '@nestjs/common';
import { CrmService } from './crm.service.js';
import { CrmScheduler } from './crm.scheduler.js';

@Module({
  providers: [CrmService, CrmScheduler],
  exports: [CrmService],
})
export class CrmModule {}
