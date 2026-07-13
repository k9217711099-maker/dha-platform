import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SecretTaskStatus } from '@prisma/client';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import type { AclActor } from '../acl/acl.service.js';
import { SecretsService, type SecretInput } from './secrets.service.js';

function actorOf(req: AdminRequest): AclActor {
  return { adminId: req.adminId, roleKey: req.adminRoleKey, perms: req.adminPerms };
}

/** Секреты: `/api/v1/secrets`, RBAC secrets_* + ACL на каждый секрет (KB-DRIVE-TZ.md §8). */
@ApiTags('secrets')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/secrets')
export class SecretsController {
  constructor(
    private readonly secrets: SecretsService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('secrets_view')
  async list(@Req() req: AdminRequest) {
    return this.secrets.list(await this.tenant.getDefaultTenantId(), actorOf(req));
  }

  @Post()
  @RequirePermission('secrets_manage')
  async create(@Body() dto: SecretInput, @Req() req: AdminRequest) {
    return this.secrets.create(await this.tenant.getDefaultTenantId(), dto, req.adminId);
  }

  @Patch(':id')
  @RequirePermission('secrets_manage')
  async update(@Param('id') id: string, @Body() dto: SecretInput, @Req() req: AdminRequest) {
    return this.secrets.update(await this.tenant.getDefaultTenantId(), id, dto, req.adminId);
  }

  @Delete(':id')
  @RequirePermission('secrets_manage')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.secrets.remove(await this.tenant.getDefaultTenantId(), id, req.adminId);
  }

  /** Раскрыть пароль — каждое обращение попадает в журнал просмотров. */
  @Post(':id/reveal')
  @RequirePermission('secrets_view')
  async reveal(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.secrets.reveal(await this.tenant.getDefaultTenantId(), id, actorOf(req));
  }

  @Get(':id/views')
  @RequirePermission('secrets_manage')
  async views(@Param('id') id: string) {
    return this.secrets.views(await this.tenant.getDefaultTenantId(), id);
  }

  // Задачи ротации (после увольнения): менеджеру — все, остальным — назначенные
  @Get('tasks/list')
  @RequirePermission('secrets_view')
  async tasks(@Req() req: AdminRequest, @Query('status') status?: string) {
    const parsed = status && status in SecretTaskStatus ? (status as SecretTaskStatus) : undefined;
    return this.secrets.tasks(await this.tenant.getDefaultTenantId(), actorOf(req), parsed);
  }

  @Post('tasks/:id/close')
  @RequirePermission('secrets_view')
  async closeTask(@Param('id') id: string, @Body() dto: { newPassword?: string; dismiss?: boolean }, @Req() req: AdminRequest) {
    return this.secrets.closeTask(await this.tenant.getDefaultTenantId(), id, dto, actorOf(req));
  }
}
