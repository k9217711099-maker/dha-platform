import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { CheckinDeskService } from './checkin-desk.service.js';
import { CheckinFunnelService } from './checkin-funnel.service.js';
import { FunnelOrchestratorService } from './funnel-orchestrator.service.js';
import { GuestCheckinLinkService } from '../portal/guest-checkin-link.service.js';

/**
 * Админ-API воронки заселения (CHECK-IN-TZ §10). Спринт 1: панель «Заселение»
 * в карточке брони (read-only) — право pms_bookings, как и само окно брони.
 * Очередь заезда/конструктор (checkin_desk / checkin_funnel_manage) — спринты 2/6.
 */
@ApiTags('checkin-funnel')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/checkin')
export class CheckinFunnelAdminController {
  constructor(
    private readonly funnel: CheckinFunnelService,
    private readonly orchestrator: FunnelOrchestratorService,
    private readonly links: GuestCheckinLinkService,
    private readonly desk: CheckinDeskService,
    private readonly tenant: TenantService,
  ) {}

  /** Очередь заезда на дату — «сегодня заезжают» для стойки (§11). */
  @Get('queue')
  @RequirePermission('checkin_desk')
  async queue(@Query('date') date?: string, @Query('propertyId') propertyId?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.desk.queue(tenantId, date, propertyId || undefined);
  }

  /** Отчёт по воронке заселения за период (по дате заезда). */
  @Get('report')
  @RequirePermission('checkin_desk')
  async report(@Query('from') from: string, @Query('to') to: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const today = new Date().toISOString().slice(0, 10);
    return this.desk.report(tenantId, from || today, to || today);
  }

  /** Выпустить/перевыпустить гостевую ссылку заселения (magic-link, §4). */
  @Post(':bookingId/link')
  @RequirePermission('pms_bookings')
  issueLink(@Param('bookingId') bookingId: string) {
    return this.links.issueFor(bookingId);
  }

  /** Ручной тик оркестратора (отладка/операционка); штатно — cron каждые 5 мин. */
  @Post('tick')
  @RequirePermission('checkin_funnel_manage')
  tick() {
    return this.orchestrator.tick();
  }

  @Get(':bookingId/panel')
  @RequirePermission('pms_bookings')
  async panel(@Param('bookingId') bookingId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.funnel.panelForBooking(tenantId, bookingId);
  }
}
