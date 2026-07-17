import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AMENITIES, AMENITY_CATEGORY_LABELS } from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';

export interface AmenityInput {
  code: string;
  label: string;
  category: string;
  icon?: string | null;
  isFilter?: boolean;
  sortOrder?: number;
}
export interface AmenityPatch {
  label?: string;
  category?: string;
  icon?: string | null;
  isFilter?: boolean;
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
 * Иконки удобств по коду домена (значение = ключ из курируемого набора админки
 * packages/ui / AmenityIcon). Проставляются автоматически, чтобы фильтры и карточки
 * показывали удобства иконками без ручной настройки каждого удобства.
 */
const AMENITY_ICON_BY_CODE: Record<string, string> = {
  kitchen: 'kitchen', kitchenette: 'kitchen', dishwasher: 'utensils', coffee_machine: 'coffee',
  cooktop: 'cooking', oven: 'cooking', microwave: 'microwave',
  bathtub: 'bath', shower: 'shower', hairdryer: 'fan',
  washer: 'laundry', ironing_board: 'iron', iron: 'iron',
  air_conditioner: 'ac', smart_tv: 'tv', wifi: 'wifi', workspace: 'monitor',
  premium_mattress: 'bed-double', safe: 'safe', wine_glasses: 'wine', baby_cot: 'baby',
  elevator: 'elevator', parking: 'parking', contactless_checkin: 'keys', digital_key: 'keys',
};

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
    if (count === 0) {
      await this.prisma.amenity.createMany({
        data: AMENITIES.map((a, i) => ({
          code: a.code,
          label: a.label,
          category: a.category,
          icon: AMENITY_ICON_BY_CODE[a.code] ?? null,
          sortOrder: i,
        })),
        skipDuplicates: true,
      });
      this.logger.log(`Словарь удобств засеян из домена: ${AMENITIES.length}`);
    }
    // Бэкфилл иконок для удобств без иконки (в т.ч. засеянных/импортированных ранее без неё).
    // Ручные настройки в админке не трогаем — обновляем только там, где icon пуст.
    let filled = 0;
    for (const [code, icon] of Object.entries(AMENITY_ICON_BY_CODE)) {
      const r = await this.prisma.amenity.updateMany({ where: { code, icon: null }, data: { icon } });
      filled += r.count;
    }
    if (filled > 0) this.logger.log(`Проставлены иконки удобств (пустые): ${filled}`);
  }

  /** Группы удобств для /catalog/filters — только помеченные как фильтр (isFilter), с иконкой. */
  async amenityCategoriesForFilters(): Promise<
    { value: string; label: string; items: { code: string; label: string; icon: string | null }[] }[]
  > {
    // Пока ни одно удобство не помечено как фильтр — показываем все активные
    // (совместимость: не обнуляем фильтры до первой настройки в админке).
    const anyFilter = await this.prisma.amenity.count({ where: { active: true, isFilter: true } });
    const all = await this.prisma.amenity.findMany({
      where: anyFilter > 0 ? { active: true, isFilter: true } : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const byCat = new Map<string, { code: string; label: string; icon: string | null }[]>();
    for (const a of all) {
      const list = byCat.get(a.category) ?? [];
      list.push({ code: a.code, label: a.label, icon: a.icon });
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
        icon: dto.icon ?? null,
        isFilter: dto.isFilter ?? false,
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
