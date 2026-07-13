import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AMENITIES, AMENITY_CATEGORY_LABELS } from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';

export interface AmenityInput {
  code: string;
  label: string;
  category: string;
  sortOrder?: number;
}
export interface AmenityPatch {
  label?: string;
  category?: string;
  sortOrder?: number;
  active?: boolean;
}
export interface RoomTypePatch {
  name?: string;
  description?: string | null;
  areaSqm?: number | null;
  bedType?: string | null;
  capacity?: number;
  amenities?: string[];
  photos?: string[];
  active?: boolean;
}

/**
 * Управление словарём удобств (фильтры) и контентом карточек номеров — для админки.
 * Словарь сидируется из packages/domain при первом запуске и далее редактируется в БД.
 */
@Injectable()
export class CatalogAdminService implements OnModuleInit {
  private readonly logger = new Logger(CatalogAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const count = await this.prisma.amenity.count();
    if (count > 0) return;
    await this.prisma.amenity.createMany({
      data: AMENITIES.map((a, i) => ({ code: a.code, label: a.label, category: a.category, sortOrder: i })),
      skipDuplicates: true,
    });
    this.logger.log(`Словарь удобств засеян из домена: ${AMENITIES.length}`);
  }

  /** Группы удобств для /catalog/filters (только активные). */
  async amenityCategoriesForFilters(): Promise<
    { value: string; label: string; items: { code: string; label: string }[] }[]
  > {
    const all = await this.prisma.amenity.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const byCat = new Map<string, { code: string; label: string }[]>();
    for (const a of all) {
      const list = byCat.get(a.category) ?? [];
      list.push({ code: a.code, label: a.label });
      byCat.set(a.category, list);
    }
    return Object.entries(AMENITY_CATEGORY_LABELS)
      .filter(([cat]) => byCat.has(cat))
      .map(([value, label]) => ({ value, label, items: byCat.get(value)! }));
  }

  // --- Админ: словарь удобств ---
  listAmenities() {
    return this.prisma.amenity.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
  }

  amenityCategories(): { value: string; label: string }[] {
    return Object.entries(AMENITY_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  }

  createAmenity(dto: AmenityInput) {
    return this.prisma.amenity.create({
      data: {
        code: dto.code.trim(),
        label: dto.label.trim(),
        category: dto.category,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  updateAmenity(id: string, dto: AmenityPatch) {
    return this.prisma.amenity.update({ where: { id }, data: dto });
  }

  async deleteAmenity(id: string): Promise<{ ok: true }> {
    await this.prisma.amenity.delete({ where: { id } });
    return { ok: true };
  }

  // --- Админ: карточки номеров ---
  listRoomTypes() {
    return this.prisma.roomType.findMany({
      include: { property: { select: { id: true, name: true } } },
      orderBy: [{ name: 'asc' }],
    });
  }

  async updateRoomType(id: string, dto: RoomTypePatch) {
    const exists = await this.prisma.roomType.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Категория не найдена');
    return this.prisma.roomType.update({ where: { id }, data: dto });
  }
}
