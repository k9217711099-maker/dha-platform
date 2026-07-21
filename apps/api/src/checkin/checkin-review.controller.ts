import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckinStatus } from '@prisma/client';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { CurrentAdminId } from '../admin/current-admin.decorator.js';
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

  /** Статус распознавания паспортов (провайдер + доступность OCR-сайдкара). */
  @Get('passport/ocr-status')
  @RequirePermission('checkins')
  ocrStatus() {
    return this.checkin.ocrStatus();
  }

  /** Скан паспорта (data-URL, расшифровка). Доступ логируется (152-ФЗ). */
  @Get('passport/doc/:docId')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Скан паспорта (расшифрованный, для просмотра)' })
  async passportDoc(@Param('docId') docId: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.checkin.passportDocument(tenantId, docId, adminId);
  }

  /** Паспортные данные + сканы гостя (последняя регистрация). Доступ логируется. */
  @Get('guest/:guestId/passport')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Паспорт гостя (карточка гостя)' })
  async passportByGuest(@Param('guestId') guestId: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.checkin.passportForGuest(tenantId, guestId, adminId);
  }

  /** Паспортные данные + сканы по брони. Доступ логируется (152-ФЗ). */
  @Get(':bookingId/passport')
  @RequirePermission('checkins')
  @ApiOperation({ summary: 'Паспорт гостя по брони (карточка брони)' })
  async passportByBooking(@Param('bookingId') bookingId: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.checkin.passportForBooking(tenantId, bookingId, adminId);
  }
}
