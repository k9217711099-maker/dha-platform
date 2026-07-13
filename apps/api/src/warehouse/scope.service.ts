import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

/**
 * Доступ сотрудника к адресам (§17.4). Пустой массив = доступ ко всем адресам
 * (центральные роли: кладовщик ЦС, руководитель, бухгалтер). Иначе — только свои.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async allowedAddressIds(adminId: string): Promise<string[]> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { allowedAddressIds: true },
    });
    return admin?.allowedAddressIds ?? [];
  }
}
