import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RolesService } from './roles.service.js';

/** Полезная нагрузка админ-токена. */
export interface AdminJwtPayload {
  sub: string;
  role: AdminRole;
  roleKey: string;
  perms: string[];
  typ: 'admin';
}

/** Аутентификация сотрудников админ-панели (§17). 2FA — TODO (§18.1). */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly roles: RolesService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; role: AdminRole }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.active || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    const roleKey = admin.roleKey ?? (admin.role === 'ADMIN' ? 'superadmin' : 'manager');
    const perms = await this.roles.permissionsOf(roleKey);
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, role: admin.role, roleKey, perms, typ: 'admin' } satisfies AdminJwtPayload,
      { expiresIn: 43200 }, // 12 часов (удобно для разработки)
    );
    return { accessToken, role: admin.role };
  }

  /** Текущий сотрудник + его права (для гейтинга UI). */
  async me(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('Сотрудник не найден');
    const roleKey = admin.roleKey ?? (admin.role === 'ADMIN' ? 'superadmin' : 'manager');
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      roleKey,
      roleName: role?.name ?? roleKey,
      permissions: role?.permissions ?? [],
    };
  }
}
