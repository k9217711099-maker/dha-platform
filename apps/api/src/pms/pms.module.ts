import { Global, Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { PromocodeModule } from '../promocodes/promocode.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PmsPromocodesController } from './promocodes/promocodes.controller.js';
import { TenantService } from './tenant/tenant.service.js';
import { RoomService } from './rooms/room.service.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { RoomTypeService } from './room-fund/room-type.service.js';
import { RoomTypesController } from './room-fund/room-types.controller.js';
import { UploadsService } from './uploads/uploads.service.js';
import { UploadsController } from './uploads/uploads.controller.js';
import { MarketingService } from './marketing/marketing.service.js';
import { MarketingController } from './marketing/marketing.controller.js';
import { IdempotencyService } from './bookings/idempotency.service.js';
import { PmsBookingService } from './bookings/pms-booking.service.js';
import { PmsBookingsController } from './bookings/pms-bookings.controller.js';
import { AvailabilityService } from './availability/availability.service.js';
import { AvailabilityController } from './availability/availability.controller.js';
import { AvailabilityScheduler } from './availability/availability.scheduler.js';
import { RateService } from './rates/rate.service.js';
import { RatePlansController } from './rates/rate-plans.controller.js';
import { RatesController } from './rates/rates.controller.js';
import { FinanceService } from './finance/finance.service.js';
import { FinanceController } from './finance/finance.controller.js';
import { TagService } from './tags/tag.service.js';
import { TagController } from './tags/tag.controller.js';
import { PropertyService } from './properties/property.service.js';
import { PropertyController } from './properties/property.controller.js';
import { FinanceDocService } from './finance-docs/finance-doc.service.js';
import { FinanceDocController } from './finance-docs/finance-doc.controller.js';
import { CounterpartyService } from './counterparties/counterparty.service.js';
import { CounterpartyController } from './counterparties/counterparty.controller.js';
import { BnovoImportService } from './import/bnovo-import.service.js';
import { BnovoImportController } from './import/bnovo-import.controller.js';

/**
 * D Hospitality Platform (PMS) — собственный движок бронирования/номерного фонда.
 * Путь B: источник истины по объектам/номерам/тарифам/броням — наша система (не Bnovo).
 * Sprint 1: мультиарендность (TenantService) + номерной фонд (Room). Дальше — booking core,
 * availability, rates, channel manager. План: serene-frolicking-tiger.
 *
 * @Global: TenantService нужен в auth/booking/catalog/warehouse для проставления tenantId.
 * Авторизация — общий AdminAuthGuard + RBAC по ключам pms_* (см. admin/permissions.ts).
 */
@Global()
@Module({
  imports: [PromocodeModule, PaymentsModule],
  controllers: [RoomsController, RoomTypesController, UploadsController, PmsBookingsController, AvailabilityController, RatePlansController, RatesController, PmsPromocodesController, MarketingController, FinanceController, TagController, PropertyController, FinanceDocController, CounterpartyController, BnovoImportController],
  providers: [
    AdminAuthGuard,
    AuditService,
    TenantService,
    RoomService,
    RoomTypeService,
    UploadsService,
    MarketingService,
    IdempotencyService,
    PmsBookingService,
    AvailabilityService,
    AvailabilityScheduler,
    RateService,
    FinanceService,
    TagService,
    PropertyService,
    FinanceDocService,
    CounterpartyService,
    BnovoImportService,
  ],
  exports: [TenantService, AvailabilityService, RateService, IdempotencyService, PmsBookingService],
})
export class PmsModule {}
