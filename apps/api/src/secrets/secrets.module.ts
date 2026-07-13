import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { AclModule } from '../acl/acl.module.js';
import { SecretsController } from './secrets.controller.js';
import { SecretsService } from './secrets.service.js';

/**
 * Модуль «Секреты» (KB-DRIVE-TZ.md §8): шифрованное хранилище паролей внешних
 * кабинетов + журнал раскрытий + офбординг-ротация. CryptoService — из глобального
 * CryptoModule. Экспортируется для хука отключения сотрудника (admin/roles.service).
 */
@Module({
  imports: [AclModule],
  controllers: [SecretsController],
  providers: [AdminAuthGuard, SecretsService, AuditService],
  exports: [SecretsService],
})
export class SecretsModule {}
