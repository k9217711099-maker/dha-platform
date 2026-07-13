import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FunnelEscalationService } from '../checkin/funnel/funnel-escalation.service.js';
import { KeysController } from './keys.controller.js';
import { KeysService } from './keys.service.js';
import { LocksService } from './locks.service.js';
import { TtlockAdminService } from './ttlock-admin.service.js';
import { KeysScheduler } from './keys.scheduler.js';

/**
 * Цифровые ключи TTLock. Эскалации проблем — в собственные задачи ops
 * (FunnelEscalationService; stateless-провайдер регистрируется и здесь, и в
 * CheckinModule, чтобы не создавать цикл: CheckinModule импортирует KeysModule).
 */
@Module({
  imports: [AuthModule],
  controllers: [KeysController],
  providers: [KeysService, LocksService, TtlockAdminService, KeysScheduler, FunnelEscalationService],
  exports: [KeysService, LocksService, TtlockAdminService],
})
export class KeysModule {}
