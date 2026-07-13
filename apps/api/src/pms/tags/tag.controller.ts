import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../tenant/tenant.service.js';
import { TAG_COLORS, TagService } from './tag.service.js';

/** Цветные теги-маркеры броней. `/api/v1/tags`, RBAC pms_bookings. */
@ApiTags('pms-tags')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/tags')
export class TagController {
  constructor(
    private readonly tags: TagService,
    private readonly tenant: TenantService,
  ) {}

  /** Палитра предустановленных цветов (ключ → hex). */
  @Get('palette')
  @RequirePermission('pms_bookings')
  palette() {
    return TAG_COLORS;
  }

  @Get()
  @RequirePermission('pms_bookings')
  async list() {
    return this.tags.list(await this.tenant.getDefaultTenantId());
  }

  @Post()
  @RequirePermission('pms_bookings')
  async create(@Body() dto: { name: string; color?: string }) {
    return this.tags.create(await this.tenant.getDefaultTenantId(), dto);
  }

  @Patch(':id')
  @RequirePermission('pms_bookings')
  async update(@Param('id') id: string, @Body() dto: { name?: string; color?: string; active?: boolean; sortOrder?: number }) {
    return this.tags.update(await this.tenant.getDefaultTenantId(), id, dto);
  }

  @Delete(':id')
  @RequirePermission('pms_bookings')
  async remove(@Param('id') id: string) {
    return this.tags.remove(await this.tenant.getDefaultTenantId(), id);
  }

  /** Заменить набор тегов брони. */
  @Patch('booking/:bookingId')
  @RequirePermission('pms_bookings')
  async setBookingTags(@Param('bookingId') bookingId: string, @Body() dto: { tagIds: string[] }) {
    return this.tags.setBookingTags(await this.tenant.getDefaultTenantId(), bookingId, dto.tagIds ?? []);
  }
}
