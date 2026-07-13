import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { StaffPushService } from './staff-push.service.js';

class SubscribeDto {
  @IsString() endpoint!: string;
  @IsObject() keys!: { p256dh: string; auth: string };
}

/** Web Push сотрудников: подписка браузера/PWA на уведомления о задачах. */
@ApiTags('ops-push')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@RequirePermission('ops_tasks')
@Controller('v1/ops/push')
export class StaffPushController {
  constructor(
    private readonly push: StaffPushService,
    private readonly tenant: TenantService,
  ) {}

  @Get('vapid-key')
  async vapidKey() {
    return { publicKey: await this.push.getPublicKey() };
  }

  @Get('status')
  async status(@Req() req: AdminRequest, @Query('endpoint') endpoint?: string) {
    return this.push.status(req.adminId, endpoint);
  }

  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto, @Req() req: AdminRequest) {
    return this.push.subscribe(await this.tenant.getDefaultTenantId(), req.adminId, dto, req.headers['user-agent']);
  }

  @Delete('subscribe')
  async unsubscribe(@Body() body: { endpoint: string }, @Req() req: AdminRequest) {
    return this.push.unsubscribe(req.adminId, body.endpoint);
  }
}
