import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { UploadsService } from '../pms/uploads/uploads.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { ExcelService } from '../warehouse/excel/excel.service.js';
import { WarehouseModule } from '../warehouse/warehouse.module.js';
import { CleaningPlanController } from './cleaning-plan.controller.js';
import { CleaningPlanService } from './cleaning-plan.service.js';
import { OpsEvents } from './ops.events.js';
import { OpsReportsController } from './ops-reports.controller.js';
import { OpsReportsService } from './ops-reports.service.js';
import { OpsPmService } from './ops-pm.service.js';
import { OpsScheduler } from './ops.scheduler.js';
import { OpsSettingsController } from './ops-settings.controller.js';
import { OpsSettingsService } from './ops-settings.service.js';
import { OpsStreamController } from './ops-stream.controller.js';
import { OpsTaskService } from './ops-task.service.js';
import { OpsTasksController } from './ops-tasks.controller.js';
import { StaffPushController } from './staff-push.controller.js';
import { StaffPushService } from './staff-push.service.js';

/**
 * Модуль «Задачи и Уборка» (TASKS-HOUSEKEEPING-TZ) — Operations 2.0 по образцу TeamJet.
 * Заменяет pms/operations (HousekeepingTask/MaintenanceTask → единый OpsTask).
 * PrismaService/TenantService/JwtService — из @Global-модулей; списание расходников —
 * через WarehouseModule (WhDocument WRITE_OFF).
 */
@Module({
  imports: [WarehouseModule],
  controllers: [OpsTasksController, OpsSettingsController, CleaningPlanController, OpsReportsController, OpsStreamController, StaffPushController],
  providers: [
    AdminAuthGuard,
    AuditService,
    ExcelService,
    UploadsService,
    OpsEvents,
    OpsTaskService,
    OpsSettingsService,
    OpsPmService,
    StaffPushService,
    CleaningPlanService,
    OpsReportsService,
    OpsScheduler,
  ],
  exports: [OpsTaskService, CleaningPlanService],
})
export class OpsModule {}
