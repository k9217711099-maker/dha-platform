import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AuditService } from './audit/audit.service.js';
import { ScopeService } from './scope.service.js';
import { OrgService } from './org/org.service.js';
import { WarehouseOrgController } from './org/org.controller.js';
import { ItemsService } from './items/items.service.js';
import { WarehouseItemsController } from './items/items.controller.js';
import { SuppliersService } from './suppliers/suppliers.service.js';
import { WarehouseSuppliersController } from './suppliers/suppliers.controller.js';
import { DocumentsService } from './documents/documents.service.js';
import { PostingService } from './documents/posting.service.js';
import { BalancesService } from './documents/balances.service.js';
import { WarehouseDocumentsController } from './documents/documents.controller.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { WarehouseStockController } from './stock.controller.js';
import { RequestsService } from './requests/requests.service.js';
import { WarehouseRequestsController } from './requests/requests.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { WarehouseInventoryController } from './inventory/inventory.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { WarehouseReportsController } from './reports/reports.controller.js';
import { ExcelService } from './excel/excel.service.js';
import { WarehouseSeedService } from './seed/warehouse-seed.service.js';

/**
 * Складской учёт управляющей компании (мини-ERP). Bounded-context.
 * Использует глобальные PrismaService/JwtService; авторизация — общий AdminAuthGuard
 * с RBAC по ключам wh_* (см. admin/permissions.ts). План: serene-frolicking-tiger.
 */
@Module({
  controllers: [
    WarehouseOrgController,
    WarehouseItemsController,
    WarehouseSuppliersController,
    WarehouseDocumentsController,
    WarehouseStockController,
    WarehouseRequestsController,
    WarehouseInventoryController,
    WarehouseReportsController,
  ],
  providers: [
    AdminAuthGuard,
    AuditService,
    ScopeService,
    OrgService,
    ItemsService,
    SuppliersService,
    DocumentsService,
    PostingService,
    BalancesService,
    DashboardService,
    RequestsService,
    InventoryService,
    ReportsService,
    ExcelService,
    WarehouseSeedService,
  ],
  exports: [PostingService, DocumentsService, BalancesService],
})
export class WarehouseModule {}
