import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LoyaltyController } from './loyalty.controller.js';
import { LoyaltyService } from './loyalty.service.js';
import { LoyaltyScheduler } from './loyalty.scheduler.js';

@Module({
  imports: [AuthModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyScheduler],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
