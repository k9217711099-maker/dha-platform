import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  CreateCategoryDto,
  CreateItemDto,
  UpdateCategoryDto,
  UpdateItemDto,
} from '../dto/warehouse.dto.js';

/** Справочник номенклатуры и категорий (§4.4, §4.5, §6.2). */
@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Категории ───
  categories() {
    return this.prisma.whCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }
  createCategory(dto: CreateCategoryDto) {
    return this.prisma.whCategory.create({ data: { name: dto.name, sortOrder: dto.sortOrder ?? 0 } });
  }
  updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.prisma.whCategory.update({ where: { id }, data: { ...dto } });
  }

  // ─── Номенклатура ───
  items(filter?: { categoryId?: string; q?: string; active?: boolean }) {
    const where: Prisma.WhItemWhereInput = {
      categoryId: filter?.categoryId,
      active: filter?.active,
    };
    if (filter?.q) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { sku: { contains: filter.q, mode: 'insensitive' } },
        { barcode: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.whItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  item(id: string) {
    return this.prisma.whItem.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  createItem(dto: CreateItemDto) {
    return this.prisma.whItem.create({ data: this.toData(dto) as Prisma.WhItemUncheckedCreateInput });
  }

  updateItem(id: string, dto: UpdateItemDto) {
    return this.prisma.whItem.update({ where: { id }, data: this.toData(dto) });
  }

  /** Импорт номенклатуры из Excel-строк (§18). Гибкие заголовки (рус/англ); upsert по артикулу или названию. */
  async importItems(rows: Record<string, unknown>[]): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
    const cats = await this.prisma.whCategory.findMany();
    const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const pick = (row: Record<string, unknown>, ...names: string[]): unknown => {
      for (const n of names) {
        for (const rk of Object.keys(row)) {
          if (rk.trim().toLowerCase() === n.toLowerCase()) return row[rk];
        }
      }
      return undefined;
    };
    const str = (v: unknown): string | undefined => (v == null || String(v).trim() === '' ? undefined : String(v).trim());
    const num = (v: unknown): number | undefined => {
      if (v == null || String(v).trim() === '') return undefined;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    };
    const bool = (v: unknown): boolean => ['да', 'yes', 'true', '1', '+', 'y'].includes(String(v ?? '').trim().toLowerCase());

    for (const [i, row] of rows.entries()) {
      try {
        const name = str(pick(row, 'название', 'наименование', 'name'));
        if (!name) {
          result.skipped += 1;
          continue;
        }
        const sku = str(pick(row, 'артикул', 'sku'));
        const catName = str(pick(row, 'категория', 'category'));
        let categoryId: string | undefined;
        if (catName) {
          categoryId = catByName.get(catName.toLowerCase());
          if (!categoryId) {
            const c = await this.prisma.whCategory.create({ data: { name: catName } });
            categoryId = c.id;
            catByName.set(catName.toLowerCase(), c.id);
          }
        }
        const price = num(pick(row, 'цена', 'price'));
        const data: Prisma.WhItemUncheckedUpdateInput = {
          name,
          sku,
          barcode: str(pick(row, 'штрихкод', 'barcode')),
          unit: str(pick(row, 'единица измерения', 'единица', 'ед', 'unit')) ?? 'шт',
          categoryId,
          minStock: num(pick(row, 'минимальный остаток', 'минимум', 'мин', 'minstock')),
          maxStock: num(pick(row, 'максимальный остаток', 'максимум', 'макс', 'maxstock')),
          lastPurchasePrice: price,
          avgPrice: price,
          trackExpiry: bool(pick(row, 'признак срока годности', 'срок годности', 'срок', 'trackexpiry')),
        };
        const existing = sku
          ? await this.prisma.whItem.findUnique({ where: { sku } })
          : await this.prisma.whItem.findFirst({ where: { name } });
        if (existing) {
          await this.prisma.whItem.update({ where: { id: existing.id }, data });
          result.updated += 1;
        } else {
          await this.prisma.whItem.create({ data: data as Prisma.WhItemUncheckedCreateInput });
          result.created += 1;
        }
      } catch (e) {
        result.errors.push(`Строка ${i + 2}: ${e instanceof Error ? e.message : 'ошибка'}`);
      }
    }
    return result;
  }

  /** Строки для экспорта номенклатуры. */
  async exportRows() {
    const items = await this.prisma.whItem.findMany({
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true } } },
    });
    return items.map((i) => ({
      sku: i.sku,
      name: i.name,
      category: i.category?.name ?? null,
      unit: i.unit,
      barcode: i.barcode,
      minStock: i.minStock,
      maxStock: i.maxStock,
      parStock: i.parStock,
      lastPurchasePrice: i.lastPurchasePrice,
      trackExpiry: i.trackExpiry,
      active: i.active,
    }));
  }

  /** PATCH-безопасный маппинг: переносим только переданные поля (undefined не трогаем). */
  private toData(dto: Partial<UpdateItemDto>): Prisma.WhItemUncheckedUpdateInput {
    const d: Prisma.WhItemUncheckedUpdateInput = {};
    const keys = [
      'name', 'sku', 'barcode', 'categoryId', 'subcategory', 'unit', 'brand',
      'description', 'photoUrl', 'trackBatches', 'trackExpiry', 'trackSerial',
      'minStock', 'maxStock', 'parStock', 'lastPurchasePrice', 'vatRate', 'active',
    ] as const;
    for (const k of keys) {
      if (dto[k] !== undefined) (d as Record<string, unknown>)[k] = dto[k];
    }
    return d;
  }
}
