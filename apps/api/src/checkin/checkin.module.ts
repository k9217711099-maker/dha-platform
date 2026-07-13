import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { CheckinController } from './checkin.controller.js';
import { CheckinReviewController } from './checkin-review.controller.js';
import { CheckinService } from './checkin.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { KeysModule } from '../keys/keys.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CheckinDeskService } from './funnel/checkin-desk.service.js';
import { CheckinFunnelAdminController } from './funnel/checkin-funnel-admin.controller.js';
import { CheckinFunnelService } from './funnel/checkin-funnel.service.js';
import { FunnelConfigController } from './funnel/funnel-config.controller.js';
import { FunnelConfigService } from './funnel/funnel-config.service.js';
import { FunnelEscalationService } from './funnel/funnel-escalation.service.js';
import { FunnelOrchestratorService } from './funnel/funnel-orchestrator.service.js';
import { FunnelScheduler } from './funnel/funnel.scheduler.js';
import { CheckinPortalController } from './portal/checkin-portal.controller.js';
import { GuestCheckinLinkService } from './portal/guest-checkin-link.service.js';

@Module({
  imports: [AuthModule, KeysModule, PaymentsModule],
  controllers: [CheckinController, CheckinReviewController, CheckinFunnelAdminController, FunnelConfigController, CheckinPortalController],
  providers: [
    CheckinService,
    CheckinDeskService,
    CheckinFunnelService,
    FunnelConfigService,
    FunnelEscalationService,
    FunnelOrchestratorService,
    FunnelScheduler,
    GuestCheckinLinkService,
    AdminAuthGuard,
    AuditService,
  ],
  exports: [CheckinService, CheckinFunnelService, FunnelConfigService, FunnelOrchestratorService, GuestCheckinLinkService],
})
export class CheckinModule {}
