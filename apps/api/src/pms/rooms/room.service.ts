import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import type { BatchCreateRoomsDto, BulkCreateRoomsDto, BulkInstructionsDto, CreateRoomDto, RoomStatusDto, UpdateRoomDto } from './dto/room.dto.js';

/** Фильтры списка номеров. */
export interface RoomFilters {
  propertyId?: string;
  roomTypeId?: string;
}

/**
 * Номерной фонд (юниты). Всё в контексте tenantId (мультиарендность).
 * Мутации пишут в аудит. Овербукинг/доступность — на уровне брони (Sprint 3+).
 */
@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Объекты с категориями для селектов формы номера (в контексте арендатора). */
  catalogOptions(tenantId: string) {
    return this.prisma.property.findMany({
      where: { tenantId },
      select: { id: true, name: true, roomTypes: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  list(tenantId: string, filters: RoomFilters = {}) {
    return this.prisma.room.findMany({
      where: {
        tenantId,
        propertyId: filters.propertyId,
        roomTypeId: filters.roomTypeId,
      },
      include: { property: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true, sortOrder: true } } },
      orderBy: [{ propertyId: 'asc' }, { sortOrder: 'asc' }, { number: 'asc' }],
    });
  }

  /**
   * Задать порядок номеров (перетаскивание в «Номерном фонде»). ids — в желаемом
   * порядке; sortOrder = позиция. Применяется к шахматке и модулю бронирования.
   */
  async reorder(tenantId: string, ids: string[], actorId?: string) {
    const owned = await this.prisma.room.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true } });
    const ownedIds = new Set(owned.map((r) => r.id));
    const ordered = ids.filter((id) => ownedIds.has(id));
    await this.prisma.$transaction(
      ordered.map((id, index) => this.prisma.room.update({ where: { id }, data: { sortOrder: index } })),
    );
    await this.audit.record({ tenantId, actorId, action: 'reordered', entity: 'Room', entityId: 'sort', payload: { count: ordered.length } });
    return { ok: true, count: ordered.length };
  }

  async get(tenantId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, tenantId },
      include: { property: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } } },
    });
    if (!room) throw new NotFoundException('Номер не найден');
    return room;
  }

  async create(tenantId: string, dto: CreateRoomDto, actorId?: string) {
    await this.assertPropertyAndRoomType(tenantId, dto.propertyId, dto.roomTypeId);
    const room = await this.prisma.room.create({
      data: {
        tenantId,
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        number: dto.number,
        floor: dto.floor ?? null,
        address: dto.address ?? null,
        comment: dto.comment ?? null,
        excludeFromStats: dto.excludeFromStats ?? false,
        sellStatus: dto.sellStatus,
        housekeepingStatus: dto.housekeepingStatus,
        maintenanceStatus: dto.maintenanceStatus,
        lockId: dto.lockId ?? null,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'Room', entityId: room.id, payload: { number: room.number } });
    return room;
  }

  /** Массовое добавление по диапазону (101…105 → 5 номеров). Существующие пропускаем. */
  async bulkCreate(tenantId: string, dto: BulkCreateRoomsDto, actorId?: string) {
    await this.assertPropertyAndRoomType(tenantId, dto.propertyId, dto.roomTypeId);
    const numbers = expandRange(dto.from, dto.to);
    const existing = await this.prisma.room.findMany({ where: { propertyId: dto.propertyId, number: { in: numbers } }, select: { number: true } });
    const taken = new Set(existing.map((r) => r.number));
    const toCreate = numbers.filter((n) => !taken.has(n));
    await this.prisma.room.createMany({
      data: toCreate.map((number) => ({
        tenantId,
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        number,
        floor: dto.floor ?? null,
        comment: dto.comment ?? null,
        excludeFromStats: dto.excludeFromStats ?? false,
      })),
    });
    await this.audit.record({ tenantId, actorId, action: 'bulk_created', entity: 'Room', entityId: dto.roomTypeId, payload: { range: `${dto.from}–${dto.to}`, created: toCreate, skipped: [...taken] } });
    return { created: toCreate.length, skipped: [...taken], numbers: toCreate };
  }

  /** Множественное добавление разных номеров (не подряд). Существующие пропускаем. */
  async batchCreate(tenantId: string, dto: BatchCreateRoomsDto, actorId?: string) {
    const typeIds = [...new Set(dto.rooms.map((r) => r.roomTypeId))];
    for (const roomTypeId of typeIds) await this.assertPropertyAndRoomType(tenantId, dto.propertyId, roomTypeId);
    const numbers = dto.rooms.map((r) => r.number);
    const existing = await this.prisma.room.findMany({ where: { propertyId: dto.propertyId, number: { in: numbers } }, select: { number: true } });
    const taken = new Set(existing.map((r) => r.number));
    const items = dto.rooms.filter((r) => !taken.has(r.number));
    await this.prisma.room.createMany({
      data: items.map((r) => ({
        tenantId,
        propertyId: dto.propertyId,
        roomTypeId: r.roomTypeId,
        number: r.number,
        floor: r.floor ?? null,
        comment: r.comment ?? null,
        excludeFromStats: r.excludeFromStats ?? false,
      })),
    });
    await this.audit.record({ tenantId, actorId, action: 'batch_created', entity: 'Room', entityId: dto.propertyId, payload: { created: items.map((r) => r.number), skipped: [...taken] } });
    return { created: items.length, skipped: [...taken], numbers: items.map((r) => r.number) };
  }

  async update(tenantId: string, id: string, dto: UpdateRoomDto, actorId?: string) {
    await this.get(tenantId, id);
    if (dto.roomTypeId) {
      const existing = await this.prisma.room.findUniqueOrThrow({ where: { id }, select: { propertyId: true } });
      await this.assertPropertyAndRoomType(tenantId, existing.propertyId, dto.roomTypeId);
    }
    const data: Prisma.RoomUpdateInput = {};
    if (dto.number !== undefined) data.number = dto.number;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.comment !== undefined) data.comment = dto.comment;
    if (dto.excludeFromStats !== undefined) data.excludeFromStats = dto.excludeFromStats;
    if (dto.roomTypeId !== undefined) data.roomType = { connect: { id: dto.roomTypeId } };
    if (dto.sellStatus !== undefined) data.sellStatus = dto.sellStatus;
    if (dto.lockId !== undefined) data.lockId = dto.lockId;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sectionId !== undefined) data.sectionId = dto.sectionId || null;
    if (dto.checkinInstructions !== undefined) data.checkinInstructions = dto.checkinInstructions || null;
    if (dto.checkinPhotos !== undefined) data.checkinPhotos = dto.checkinPhotos;
    const room = await this.prisma.room.update({ where: { id }, data });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'Room', entityId: id, payload: { ...dto } });
    return room;
  }

  /**
   * Массовое заполнение инструкций по заселению и адресов (режим апартаментов).
   * Обновляет только переданные поля каждого номера; все юниты — в одном tenant.
   * Пустая строка очищает поле (→ каскад к общей инструкции объекта).
   */
  async bulkInstructions(tenantId: string, dto: BulkInstructionsDto, actorId?: string) {
    const ids = dto.items.map((i) => i.roomId);
    const owned = await this.prisma.room.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((r) => r.id));
    const skipped = ids.filter((id) => !ownedIds.has(id));
    let updated = 0;
    await this.prisma.$transaction(
      dto.items
        .filter((i) => ownedIds.has(i.roomId))
        .map((i) => {
          const data: Prisma.RoomUpdateInput = {};
          if (i.address !== undefined) data.address = i.address || null;
          if (i.checkinInstructions !== undefined) data.checkinInstructions = i.checkinInstructions || null;
          updated += 1;
          return this.prisma.room.update({ where: { id: i.roomId }, data });
        }),
    );
    await this.audit.record({
      tenantId, actorId, action: 'updated', entity: 'Room', entityId: 'bulk-instructions',
      payload: { count: updated, skipped },
    });
    return { updated, skipped };
  }

  /** Сменить операционный статус (housekeeping / maintenance / продаваемость). */
  async setStatus(tenantId: string, id: string, dto: RoomStatusDto, actorId?: string) {
    await this.get(tenantId, id);
    if (dto.housekeepingStatus === undefined && dto.maintenanceStatus === undefined && dto.sellStatus === undefined) {
      throw new BadRequestException('Не указан ни один статус');
    }
    const room = await this.prisma.room.update({
      where: { id },
      data: {
        housekeepingStatus: dto.housekeepingStatus,
        maintenanceStatus: dto.maintenanceStatus,
        sellStatus: dto.sellStatus,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'status_changed', entity: 'Room', entityId: id, payload: { ...dto } });
    return room;
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    await this.get(tenantId, id);
    await this.prisma.room.delete({ where: { id } });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'Room', entityId: id });
    return { ok: true };
  }

  /** Объект и категория должны существовать в этом tenant, а категория — принадлежать объекту. */
  private async assertPropertyAndRoomType(tenantId: string, propertyId: string, roomTypeId: string) {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
    if (!property) throw new BadRequestException('Объект размещения не найден');
    const roomType = await this.prisma.roomType.findFirst({ where: { id: roomTypeId, tenantId }, select: { propertyId: true } });
    if (!roomType) throw new BadRequestException('Категория номера не найдена');
    if (roomType.propertyId !== propertyId) throw new BadRequestException('Категория относится к другому объекту');
  }
}

/**
 * Развернуть числовой диапазон номеров: 101…105 → ['101','102','103','104','105'].
 * Поддерживает общий буквенный префикс (A01…A03) и ведущие нули. Некорректный
 * диапазон (разные префиксы / to < from / не число) → одиночный `from`. Предохранитель — 200.
 */
export function expandRange(from: string, to: string): string[] {
  const a = from.trim();
  const b = to.trim();
  const m1 = /^(\D*)(\d+)$/.exec(a);
  const m2 = /^(\D*)(\d+)$/.exec(b);
  const d1 = m1?.[2];
  const d2 = m2?.[2];
  if (!d1 || !d2 || (m1?.[1] ?? '') !== (m2?.[1] ?? '')) return [a];
  const prefix = m1?.[1] ?? '';
  const start = parseInt(d1, 10);
  const end = parseInt(d2, 10);
  if (end < start) return [a];
  const width = d1.length;
  const count = Math.min(end - start + 1, 200);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`${prefix}${String(start + i).padStart(width, '0')}`);
  return out;
}
