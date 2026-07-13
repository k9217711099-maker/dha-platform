import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

/** Чтение каталога из нашей БД (наполняется синхронизацией из Bnovo). */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listProperties() {
    return this.prisma.property.findMany({
      where: { active: true },
      include: { roomTypes: { where: { active: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getProperty(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { roomTypes: { where: { active: true } } },
    });
    if (!property) throw new NotFoundException('Объект не найден');
    return property;
  }
}
