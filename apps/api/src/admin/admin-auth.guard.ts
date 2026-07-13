import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { AdminJwtPayload } from './admin-auth.service.js';
import { PERM_KEY } from './require-permission.decorator.js';

export interface AdminRequest extends Request {
  adminId: string;
  adminRole: string;
  /** Ключ роли доступа (модель Role) — субъект ACL-грантов «на роль». */
  adminRoleKey: string | null;
  adminPerms: string[];
}

/** Пропускает только админ-токены (typ: 'admin') и проверяет право доступа эндпоинта. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Требуется вход администратора');

    let payload: AdminJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminJwtPayload>(header.slice(7));
      if (payload.typ !== 'admin') throw new Error('not admin');
    } catch {
      throw new UnauthorizedException('Недействительный токен администратора');
    }

    // Права и статус берём из БД по sub, а НЕ из токена: смена роли/деактивация действуют
    // сразу, без перелогина (иначе задачи «не видны», пока в токене старые perms). §3/#20.
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, active: true, role: true, roleKey: true },
    });
    if (!admin || !admin.active) throw new UnauthorizedException('Учётная запись недоступна');
    const roleKey = admin.roleKey ?? (admin.role === 'ADMIN' ? 'superadmin' : 'manager');
    const role = await this.prisma.role.findUnique({ where: { key: roleKey }, select: { permissions: true } });

    req.adminId = admin.id;
    req.adminRole = admin.role;
    req.adminRoleKey = roleKey;
    req.adminPerms = role?.permissions ?? [];

    // Право доступа эндпоинта (если задано @RequirePermission)
    const required = this.reflector.getAllAndOverride<string | undefined>(PERM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !req.adminPerms.includes(required)) {
      throw new ForbiddenException('Недостаточно прав для этого раздела');
    }
    return true;
  }
}
