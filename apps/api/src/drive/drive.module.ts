import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { AclModule } from '../acl/acl.module.js';
import { DriveController } from './drive.controller.js';
import { WopiController } from './wopi.controller.js';
import { DriveService } from './drive.service.js';
import { LinksController, PublicAccessController } from '../links/links.controller.js';
import { PublicLinkService } from '../links/public-link.service.js';

/**
 * Диск + публичные ссылки (KB-DRIVE-TZ.md §5). Публичные ссылки — общий механизм
 * для файлов Диска и страниц БЗ, поэтому живут здесь одним модулем.
 */
@Module({
  imports: [AclModule],
  controllers: [DriveController, WopiController, LinksController, PublicAccessController],
  providers: [AdminAuthGuard, DriveService, PublicLinkService, AuditService],
  exports: [DriveService, PublicLinkService],
})
export class DriveModule {}
