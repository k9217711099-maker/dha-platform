import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AclController, GroupsController } from './acl.controller.js';
import { AclService } from './acl.service.js';

/** Точечные доступы (ACL) и группы сотрудников — общий слой для БЗ и Диска (§2). */
@Module({
  controllers: [AclController, GroupsController],
  providers: [AdminAuthGuard, AclService],
  exports: [AclService],
})
export class AclModule {}
