import { Injectable, Logger } from '@nestjs/common';
import { PropertyKind, PropertyType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { HttpBnovoAdapter } from '../../integrations/bnovo/http-bnovo.adapter.js';
import type { BnovoProperty, BnovoRoom, BnovoRoomType } from '../../integrations/bnovo/bnovo.types.js';

/** Что делать с существующими (не импортированными) категориями. */
export type DeleteExistingMode = 'all' | 'empty' | 'hide' | 'none';

export interface BnovoImportPreview {
  reachable: boolean;
  error?: string;
  bnovo: { properties: number; roomTypes: number; rooms: number; sampleRoomTypes: { name: string; capacity: number }[]; sampleRooms: { number: string; floor?: string }[] };
  existing: { id: string; name: string; property: string; rooms: number; bookings: number; fromBnovo: boolean }[];
}

export interface BnovoImportResult {
  properties: number;
  roomTypes: number;
  rooms: number;
  deletedCategories: number;
  deletedBookings: number;
  hiddenCategories: number;
  keptCategories: { name: string; bookings: number }[];
}

/**
 * Импорт номерного фонда из Bnovo (категории + физические номера) в наш PMS (Путь B).
 * Использует РЕАЛЬНЫЙ HttpBnovoAdapter напрямую (независимо от BNOVO_PROVIDER), т.к.
 * выгрузка — разовая операция миграции. Идемпотентно по bnovoId. Опционально удаляет
 * существующие (не из Bnovo) категории — вместе с их бронями (решение владельца).
 */
@Injectable()
export class BnovoImportService {
  private readonly logger = new Logger(BnovoImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bnovo: HttpBnovoAdapter,
    private readonly audit: AuditService,
  ) {}

  /** Собрать данные Bnovo (по всем объектам, с дедупликацией по bnovoId). */
  private async fetchBnovo(): Promise<{ properties: BnovoProperty[]; roomTypes: BnovoRoomType[]; rooms: BnovoRoom[] }> {
    const properties = await this.bnovo.listProperties();
    const rtMap = new Map<string, BnovoRoomType>();
    const roomMap = new Map<string, BnovoRoom>();
    for (const p of properties) {
      for (const rt of await this.bnovo.listRoomTypes(p.id)) rtMap.set(rt.id, rt);
      for (const rm of await this.bnovo.listRooms(p.id)) roomMap.set(rm.id, rm);
    }
    return { properties, roomTypes: [...rtMap.values()], rooms: [...roomMap.values()] };
  }

  async preview(tenantId: string): Promise<BnovoImportPreview> {
    const existing = await this.existingCategories(tenantId);
    try {
      const { properties, roomTypes, rooms } = await this.fetchBnovo();
      // Только родительские категории — дети Bnovo это варианты размещения по числу гостей.
      const categories = roomTypes.filter((rt) => !rt.parentId);
      return {
        reachable: true,
        bnovo: {
          properties: new Set([...categories.map((r) => r.propertyId), ...properties.map((p) => p.id)].filter(Boolean)).size,
          roomTypes: categories.length,
          rooms: rooms.length,
          sampleRoomTypes: categories.slice(0, 8).map((r) => ({ name: r.name, capacity: r.capacity })),
          sampleRooms: rooms.slice(0, 8).map((r) => ({ number: r.number, floor: r.floor })),
        },
        existing,
      };
    } catch (e) {
      return {
        reachable: false,
        error: e instanceof Error ? e.message : 'Bnovo недоступен',
        bnovo: { properties: 0, roomTypes: 0, rooms: 0, sampleRoomTypes: [], sampleRooms: [] },
        existing,
      };
    }
  }

  private async existingCategories(tenantId: string) {
    const rows = await this.prisma.roomType.findMany({
      where: { tenantId },
      include: { property: { select: { name: true } }, _count: { select: { rooms: true, bookings: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, property: r.property.name, rooms: r._count.rooms, bookings: r._count.bookings, fromBnovo: !!r.bnovoId }));
  }

  async apply(tenantId: string, mode: DeleteExistingMode, actorId?: string): Promise<BnovoImportResult> {
    const { properties, roomTypes, rooms } = await this.fetchBnovo();
    const baseName = properties[0]?.name ?? 'D H&A (Bnovo)';
    const propMeta = new Map(properties.map((p) => [p.id, p]));

    // Только родительские категории; дети (варианты по числу гостей) → карта childId→parentId для номеров.
    const categories = roomTypes.filter((rt) => !rt.parentId);
    const parentOf = new Map(roomTypes.filter((rt) => rt.parentId).map((rt) => [rt.id, rt.parentId!]));

    // 1) Объекты — по distinct propertyId из категорий (у HTTP-адаптера объект = hotel_id).
    const distinctPropIds = new Set(categories.map((r) => r.propertyId).filter(Boolean));
    if (distinctPropIds.size === 0 && properties[0]) distinctPropIds.add(properties[0].id);
    const multiProp = distinctPropIds.size > 1;
    const propDbId = new Map<string, string>();
    for (const pid of distinctPropIds) {
      const meta = propMeta.get(pid);
      const name = meta?.name ?? (multiProp ? `${baseName} · Объект ${pid}` : baseName);
      const prop = await this.prisma.property.upsert({
        where: { bnovoId: pid },
        update: { name },
        create: { tenantId, bnovoId: pid, name, type: PropertyType.HOTEL, kind: PropertyKind.HOTEL, city: 'Санкт-Петербург', address: meta?.address ?? '', active: true },
      });
      propDbId.set(pid, prop.id);
    }
    const fallbackPropDbId = [...propDbId.values()][0];

    // 2) Категории — идемпотентно по bnovoId.
    const rtDbId = new Map<string, string>();
    const importedPropDbIds = new Set<string>();
    for (const rt of categories) {
      const dbProp = propDbId.get(rt.propertyId) ?? fallbackPropDbId;
      if (!dbProp) continue;
      importedPropDbIds.add(dbProp);
      const cat = await this.prisma.roomType.upsert({
        where: { bnovoId: rt.id },
        update: { name: rt.name, capacity: Math.max(1, rt.capacity), propertyId: dbProp },
        create: { tenantId, bnovoId: rt.id, propertyId: dbProp, name: rt.name, capacity: Math.max(1, rt.capacity), mainPlaces: Math.max(1, rt.capacity), description: rt.description ?? null },
      });
      rtDbId.set(rt.id, cat.id);
    }

    // 3) Номера — идемпотентно по bnovoId; объект берём у категории (консистентность).
    let roomCount = 0;
    for (const rm of rooms) {
      // Номер может ссылаться на вариант-ребёнка — приводим к родительской категории.
      const catBnovoId = rtDbId.has(rm.roomTypeId) ? rm.roomTypeId : (parentOf.get(rm.roomTypeId) ?? rm.roomTypeId);
      const dbRt = rtDbId.get(catBnovoId);
      if (!dbRt) continue;
      const cat = await this.prisma.roomType.findUnique({ where: { id: dbRt }, select: { propertyId: true } });
      if (!cat) continue;
      await this.prisma.room.upsert({
        where: { bnovoId: rm.id },
        update: { number: rm.number, floor: rm.floor ?? null, propertyId: cat.propertyId, roomTypeId: dbRt },
        create: { tenantId, bnovoId: rm.id, propertyId: cat.propertyId, roomTypeId: dbRt, number: rm.number, floor: rm.floor ?? null },
      });
      roomCount++;
    }

    // 4) Существующие (не из этого импорта) категории — по выбранному режиму.
    const importedRtDbIds = new Set(rtDbId.values());
    const oldCats = await this.prisma.roomType.findMany({
      where: { tenantId, id: { notIn: [...importedRtDbIds] } },
      include: { _count: { select: { bookings: true } } },
    });
    let deletedCategories = 0, deletedBookings = 0, hiddenCategories = 0;
    const keptCategories: { name: string; bookings: number }[] = [];

    if (mode === 'hide') {
      const ids = oldCats.map((c) => c.id);
      if (ids.length) await this.prisma.roomType.updateMany({ where: { id: { in: ids } }, data: { active: false } });
      hiddenCategories = ids.length;
    } else if (mode === 'empty' || mode === 'all') {
      for (const c of oldCats) {
        if (c._count.bookings > 0 && mode === 'empty') { keptCategories.push({ name: c.name, bookings: c._count.bookings }); continue; }
        if (c._count.bookings > 0) {
          const del = await this.prisma.booking.deleteMany({ where: { roomTypeId: c.id } });
          deletedBookings += del.count;
        }
        await this.prisma.roomType.delete({ where: { id: c.id } }); // каскадом удалит номера/избранное
        deletedCategories++;
      }
    }

    await this.audit.record({ tenantId, actorId, action: 'bnovo_import', entity: 'RoomType', entityId: null, payload: { roomTypes: rtDbId.size, rooms: roomCount, mode, deletedCategories, deletedBookings, hiddenCategories } });
    this.logger.log(`Импорт Bnovo: категорий ${rtDbId.size}, номеров ${roomCount}, удалено категорий ${deletedCategories} (броней ${deletedBookings}), скрыто ${hiddenCategories}`);
    return { properties: propDbId.size, roomTypes: rtDbId.size, rooms: roomCount, deletedCategories, deletedBookings, hiddenCategories, keptCategories };
  }
}
