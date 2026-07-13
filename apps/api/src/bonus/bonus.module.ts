import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { BonusController } from './bonus.controller.js';
import { BonusService } from './bonus.service.js';

/**
 * Бонусная программа сотрудников (§7) — нематериальное признание.
 * PrismaService/TenantService/JwtService — из @Global-модулей.
 */
@Module({
  controllers: [BonusController],
  providers: [BonusService, AdminAuthGuard],
  exports: [BonusService],
})
export class BonusModule {}
