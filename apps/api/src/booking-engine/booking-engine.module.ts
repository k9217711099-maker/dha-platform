import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PromocodeModule } from '../promocodes/promocode.module.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { BookingEngineService } from './booking-engine.service.js';
import { BookingEngineController } from './booking-engine.controller.js';
import { BookingEngineSearchController } from './booking-engine-search.controller.js';
import { BookingEngineScheduler } from './booking-engine.scheduler.js';

/**
 * Booking Engine (Путь B): гостевой движок бронирования на собственном PMS.
 * AvailabilityService/RateService/TenantService/IdempotencyService приходят из @Global PmsModule.
 */
@Module({
  imports: [AuthModule, LoyaltyModule, PaymentsModule, PromocodeModule],
  controllers: [BookingEngineSearchController, BookingEngineController],
  providers: [BookingEngineService, BookingEngineScheduler, AuditService],
  exports: [BookingEngineService],
})
export class BookingEngineModule {}
