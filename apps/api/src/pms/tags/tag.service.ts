import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TenantService } from '../tenant/tenant.service.js';

/** Предустановленная «яркая» палитра цветов тегов (§6). Ключ → hex для фронта. */
export const TAG_COLORS: Record<string, string> = {
  red: '#EF4444',
  amber: '#F59E0B',
  emerald: '#10B981',
  blue: '#3B82F6',
  violet: '#8B5CF6',
};
const DEFAULT_COLOR = 'blue';

/** Цветные теги-маркеры броней (шахматка). Пользователь заводит названия и выбирает цвет из палитры. */
@Injectable()
export class TagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  list(tenantId: string) {
    return this.prisma.bookingTag.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(tenantId: string, dto: { name: string; color?: string }) {
    const color = dto.color && TAG_COLORS[dto.color] ? dto.color : DEFAULT_COLOR;
    const max = await this.prisma.bookingTag.aggregate({ where: { tenantId }, _max: { sortOrder: true } });
    return this.prisma.bookingTag.create({
      data: { tenantId, name: dto.name.trim(), color, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  async update(tenantId: string, id: string, dto: { name?: string; color?: string; active?: boolean; sortOrder?: number }) {
    const found = await this.prisma.bookingTag.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Тег не найден');
    return this.prisma.bookingTag.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined && TAG_COLORS[dto.color] ? { color: dto.color } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const found = await this.prisma.bookingTag.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Тег не найден');
    await this.prisma.bookingTag.delete({ where: { id } });
    return { ok: true };
  }

  /** Заменить набор тегов брони (связь m2m). Валидирует принадлежность тегов арендатору. */
  async setBookingTags(tenantId: string, bookingId: string, tagIds: string[]) {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    const valid = await this.prisma.bookingTag.findMany({ where: { tenantId, id: { in: tagIds } }, select: { id: true } });
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { tags: { set: valid.map((t) => ({ id: t.id })) } },
    });
    return this.prisma.bookingTag.findMany({ where: { id: { in: valid.map((t) => t.id) } }, orderBy: { sortOrder: 'asc' } });
  }
}
