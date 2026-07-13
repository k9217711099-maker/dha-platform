import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckinStatus } from '@prisma/client';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { CheckinService } from './checkin.service.js';
import { ReviewCheckinDto } from './dto/review-checkin.dto.js';

/**
 * Админ-API проверки онлайн-регистраций (§8.4). Отдельно от гостевого
 * CheckinController (JWT гостя): здесь AdminAuthGuard + право `checkins`.
 * Страница админки «Онлайн-регистрации» (/checkins) читает очередь SUBMITTED
 * и подтверждает/возвращает анкеты.
 */
@ApiTags('checkin-review')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/checkin')
export class CheckinReviewController {
  constructor(
    private readonly checkin: CheckinService,
    private readonly tenant: TenantService,
  ) {}

  @Get('registrations')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Очередь онлайн-регистраций на проверку' })
  async list(@Query('status') status?: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const st = status && status in CheckinStatus ? (status as CheckinStatus) : CheckinStatus.SUBMITTED;
    return this.checkin.listForReview(tenantId, st);
  }

  @Post('registrations/:bookingId/approve')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Подтвердить регистрацию (запускает воронку заселения)' })
  approve(@Param('bookingId') bookingId: string) {
    return this.checkin.approve(bookingId);
  }

  @Post('registrations/:bookingId/reject')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Вернуть на исправление или отклонить регистрацию' })
  reject(@Param('bookingId') bookingId: string, @Body() dto: ReviewCheckinDto) {
    return this.checkin.reject(bookingId, dto.reason, dto.needsFix ?? true);
  }
}
