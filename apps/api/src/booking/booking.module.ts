import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CrmModule } from '../crm/crm.module.js';
import { PromocodeModule } from '../promocodes/promocode.module.js';
import { ExtrasModule } from '../extras/extras.module.js';
import { BookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';

@Module({
  imports: [AuthModule, LoyaltyModule, PaymentsModule, CrmModule, PromocodeModule, ExtrasModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
