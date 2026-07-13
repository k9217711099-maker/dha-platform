import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { PaymentsService } from '../../payments/payments.service.js';
import { PmsBookingService } from './pms-booking.service.js';
import { BookingExtraInputDto, CancelBookingDto, CheckInDto, CreateBookingDto, ManualPaymentDto, PaymentLinkDto, UpdateBookingDto } from './dto/booking.dto.js';

/**
 * Собственные брони PMS (DHP). `POST /api/v1/bookings` требует заголовок
 * `Idempotency-Key` (ADR-003). RBAC — pms_bookings; tenantId пока дефолтный.
 */
@ApiTags('pms-bookings')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/bookings')
export class PmsBookingsController {
  constructor(
    private readonly bookings: PmsBookingService,
    private readonly tenant: TenantService,
    private readonly payments: PaymentsService,
  ) {}

  @Post()
  @RequirePermission('pms_bookings')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Ключ идемпотентности (защита от дублей)' })
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentAdminId() adminId: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.create(tenantId, dto, adminId, idempotencyKey);
  }

  @Get()
  @RequirePermission('pms_bookings')
  async list(
    @Query('status') status?: BookingStatus,
    @Query('propertyId') propertyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.list(tenantId, { status, propertyId, from, to });
  }

  @Get(':id')
  @RequirePermission('pms_bookings')
  async get(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.get(tenantId, id);
  }

  @Patch(':id')
  @RequirePermission('pms_bookings')
  async update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.update(tenantId, id, dto, adminId);
  }

  @Post(':id/cancel')
  @RequirePermission('pms_bookings')
  async cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.cancel(tenantId, id, dto, adminId);
  }

  @Post(':id/check-in')
  @RequirePermission('pms_bookings')
  async checkIn(@Param('id') id: string, @Body() dto: CheckInDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.checkIn(tenantId, id, dto, adminId);
  }

  @Post(':id/check-out')
  @RequirePermission('pms_bookings')
  async checkOut(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.checkOut(tenantId, id, adminId);
  }

  @Post(':id/no-show')
  @RequirePermission('pms_bookings')
  async noShow(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.noShow(tenantId, id, adminId);
  }

  @Post(':id/revert-check-in')
  @RequirePermission('pms_bookings')
  async revertCheckIn(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.revertCheckIn(tenantId, id, adminId);
  }

  @Post(':id/reopen')
  @RequirePermission('pms_reopen_checkout')
  async reopen(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.reopenCheckout(tenantId, id, adminId);
  }

  @Post(':id/extras')
  @RequirePermission('pms_bookings')
  async addExtra(@Param('id') id: string, @Body() dto: BookingExtraInputDto, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.addExtra(tenantId, id, dto, adminId);
  }

  @Delete(':id/extras/:lineId')
  @RequirePermission('pms_bookings')
  async removeExtra(@Param('id') id: string, @Param('lineId') lineId: string, @CurrentAdminId() adminId: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.removeExtra(tenantId, id, lineId, adminId);
  }

  @Get(':id/payment-info')
  @RequirePermission('pms_bookings')
  async paymentInfo(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.paymentInfo(tenantId, id);
  }

  /** Выставить гостю ссылку на оплату (предоплата по гарантии или полный остаток). */
  @Post(':id/payment-link')
  @RequirePermission('pms_bookings')
  async paymentLink(@Param('id') id: string, @Body() dto: PaymentLinkDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const info = await this.bookings.paymentInfo(tenantId, id);
    const amount = dto.amount ?? (dto.kind === 'prepayment' ? info.prepayment : info.remaining);
    if (!amount || amount <= 0) {
      return { error: dto.kind === 'prepayment' ? 'Предоплата по этому тарифу не требуется' : 'Остаток к оплате равен нулю' };
    }
    // Ссылку формирует активный эквайер; выбранная оператором ПС возвращается для отображения.
    const link = await this.payments.createForBookingByAdmin(id, { amount });
    return { ...link, system: dto.system };
  }

  /** История платежей по брони (вкладка «Счёт»). */
  @Get(':id/payments')
  @RequirePermission('pms_bookings')
  async listPayments(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    await this.bookings.get(tenantId, id); // 404, если бронь не в этом арендаторе
    return this.payments.listForBooking(id);
  }

  /** Журнал изменений брони (аудит) — вкладка «Журнал». */
  @Get(':id/audit')
  @RequirePermission('pms_bookings')
  async auditTrail(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.bookings.auditTrail(tenantId, id);
  }

  /** Зарегистрировать оплату на стойке (наличные/карта/перевод). */
  @Post(':id/payments/manual')
  @RequirePermission('pms_bookings')
  async recordManualPayment(@Param('id') id: string, @Body() dto: ManualPaymentDto) {
    const tenantId = await this.tenant.getDefaultTenantId();
    await this.bookings.get(tenantId, id);
    return this.payments.recordManual(id, dto);
  }
}
