import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CheckinModule } from '../checkin/checkin.module.js';
import { KeysModule } from '../keys/keys.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { PromocodeModule } from '../promocodes/promocode.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { ExtrasModule } from '../extras/extras.module.js';
import { SecretsModule } from '../secrets/secrets.module.js';
import { AclModule } from '../acl/acl.module.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminService } from './admin.service.js';
import { RolesService } from './roles.service.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminController } from './admin.controller.js';
import { RolesController } from './roles.controller.js';
import { ProfileController } from './profile.controller.js';
import { UploadsService } from '../pms/uploads/uploads.service.js';

@Module({
  imports: [CatalogModule, CheckinModule, KeysModule, LoyaltyModule, PromocodeModule, AnalyticsModule, ExtrasModule, SecretsModule, AclModule],
  controllers: [AdminAuthController, AdminController, RolesController, ProfileController],
  providers: [AdminAuthService, AdminAuthGuard, AdminService, RolesService, UploadsService],
})
export class AdminModule {}
