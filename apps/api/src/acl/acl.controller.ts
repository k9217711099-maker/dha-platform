import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, Patch, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AclLevel } from '@prisma/client';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { AclService, type AclResourceType } from './acl.service.js';

const RESOURCE_TYPES: AclResourceType[] = ['kb_base', 'kb_page', 'drive_node', 'secret'];

function managePermFor(type: string): string {
  return type === 'drive_node' ? 'drive_manage' : type === 'secret' ? 'secrets_manage' : 'kb_manage';
}

/** Гранты доступа и группы сотрудников (KB-DRIVE-TZ.md §2). */
@ApiTags('acl')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/acl')
export class AclController {
  constructor(
    private readonly acl: AclService,
    private readonly tenant: TenantService,
    private readonly prisma: PrismaService,
  ) {}

  /** Каталог субъектов для выпадающих списков (сотрудники/роли/группы). */
  @Get('subjects')
  async subjects(@Req() req: AdminRequest) {
    if (!['kb_manage', 'drive_manage', 'secrets_manage'].some((p) => req.adminPerms.includes(p))) {
      throw new ForbiddenException('Нужно право управления БЗ, Диском или Секретами');
    }
    const tenantId = await this.tenant.getDefaultTenantId();
    const [users, roles, groups] = await Promise.all([
      this.prisma.adminUser.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, email: true }, orderBy: { email: 'asc' } }),
      this.prisma.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.userGroup.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { users, roles, groups };
  }

  @Get(':resourceType/:resourceId')
  async list(@Param('resourceType') resourceType: string, @Param('resourceId') resourceId: string, @Req() req: AdminRequest) {
    this.assertType(resourceType, req);
    return this.acl.listEntries(await this.tenant.getDefaultTenantId(), resourceType as AclResourceType, resourceId);
  }

  @Put(':resourceType/:resourceId')
  async set(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: { entries?: { subjectType: string; subjectId: string; level: AclLevel }[] },
    @Req() req: AdminRequest,
  ) {
    this.assertType(resourceType, req);
    return this.acl.setEntries(
      await this.tenant.getDefaultTenantId(),
      resourceType as AclResourceType,
      resourceId,
      dto.entries ?? [],
    );
  }

  private assertType(resourceType: string, req: AdminRequest) {
    if (!RESOURCE_TYPES.includes(resourceType as AclResourceType)) throw new BadRequestException('Неизвестный тип ресурса');
    if (!req.adminPerms.includes(managePermFor(resourceType))) {
      throw new ForbiddenException('Недостаточно прав для управления доступами');
    }
  }
}

/** Группы сотрудников — субъекты грантов. Управление — право «Роли и доступы». */
@ApiTags('acl')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/groups')
export class GroupsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @RequirePermission('roles')
  async list() {
    const tenantId = await this.tenant.getDefaultTenantId();
    const groups = await this.prisma.userGroup.findMany({
      where: { tenantId },
      include: { members: { select: { adminUserId: true } } },
      orderBy: { name: 'asc' },
    });
    return groups.map((g) => ({
      id: g.id, name: g.name, color: g.color, headUserId: g.headUserId, parentId: g.parentId,
      memberIds: g.members.map((m) => m.adminUserId),
    }));
  }

  @Post()
  @RequirePermission('roles')
  async create(@Body() dto: { name?: string; color?: string; headUserId?: string; parentId?: string }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Укажите название отдела');
    const tenantId = await this.tenant.getDefaultTenantId();
    const group = await this.prisma.userGroup.create({
      data: { tenantId, name, color: dto.color || '#6366f1', headUserId: dto.headUserId || null, parentId: dto.parentId || null },
    });
    return { id: group.id, name: group.name, color: group.color, headUserId: group.headUserId, parentId: group.parentId, memberIds: [] };
  }

  @Patch(':id')
  @RequirePermission('roles')
  async update(@Param('id') id: string, @Body() dto: { name?: string; memberIds?: string[]; color?: string; headUserId?: string | null; parentId?: string | null }) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const group = await this.prisma.userGroup.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Отдел не найден');
    if (dto.parentId && dto.parentId === id) throw new BadRequestException('Отдел не может быть подотделом самого себя');
    await this.prisma.userGroup.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        color: dto.color || undefined,
        headUserId: dto.headUserId !== undefined ? (dto.headUserId || null) : undefined,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : undefined,
      },
    });
    if (dto.memberIds) {
      await this.prisma.$transaction([
        this.prisma.userGroupMember.deleteMany({ where: { groupId: id } }),
        this.prisma.userGroupMember.createMany({
          data: dto.memberIds.map((adminUserId) => ({ groupId: id, adminUserId })),
          skipDuplicates: true,
        }),
      ]);
    }
    const fresh = await this.prisma.userGroup.findUnique({ where: { id }, include: { members: { select: { adminUserId: true } } } });
    return { id, name: fresh!.name, color: fresh!.color, headUserId: fresh!.headUserId, parentId: fresh!.parentId, memberIds: fresh!.members.map((m) => m.adminUserId) };
  }

  @Delete(':id')
  @RequirePermission('roles')
  async remove(@Param('id') id: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const group = await this.prisma.userGroup.findFirst({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Группа не найдена');
    await this.prisma.$transaction([
      this.prisma.aclEntry.deleteMany({ where: { tenantId, subjectType: 'group', subjectId: id } }),
      this.prisma.userGroup.delete({ where: { id } }),
    ]);
    return { ok: true };
  }
}
