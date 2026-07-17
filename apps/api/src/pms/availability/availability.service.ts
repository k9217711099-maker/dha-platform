import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { maxNightlyOccupancy, type OccupancyInterval, rangeNights, toUtcDay } from './availability.util.js';
import type { CreateBlockDto, CreateLockDto, SearchAvailabilityDto } from './dto/availability.dto.js';

/** Статусы брони, занимающие инвентарь (DHP Availability §15). Остальные освобождают. */
const OCCUPYING_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
/** TTL инвентарного лока по умолчанию (DHP Availability §8). */
const DEFAULT_LOCK_TTL_MIN = 15;

export interface RoomTypeAvailability {
  roomTypeId: string;
  roomTypeName: string;
  propertyId: string;
  propertyName: string;
  capacity: number;
  totalRooms: number;
  available: number;
  nights: number;
}

/** Параметры проверки доступности при создании/изменении брони или лока. */
export interface BookingAvailabilityParams {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  roomId?: string | null;
  checkIn: string | Date;
  checkOut: string | Date;
  roomsCount?: number;
  /** Исключить бронь из расчёта занятости (при изменении дат/номера существующей брони). */
  excludeBookingId?: string;
}

interface BlockFilters {
  propertyId?: string;
  roomId?: string;
}

/**
 * Availability Engine (DHP §21) — источник истины по доступности. Овербукинг невозможен:
 * итоговая проверка идёт ТОЛЬКО внутри PG-транзакции с `SELECT … FOR UPDATE` на номерах
 * категории (сериализует конкурентные брони), кэш истиной не является. Формула:
 * `Available = TotalSellable − Bookings − Locks − Blocks`; дата выезда ночь не занимает.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Поиск доступности (read-only, без локов) ───
  async search(tenantId: string, q: SearchAvailabilityDto): Promise<RoomTypeAvailability[]> {
    const nights = rangeNights(q.checkIn, q.checkOut);
    if (nights.length === 0) throw new BadRequestException('Дата выезда должна быть позже даты заезда');
    const ciDate = new Date(toUtcDay(q.checkIn));
    const coDate = new Date(toUtcDay(q.checkOut));
    const occupancy = Math.max((q.guests ?? 1) + (q.children ?? 0), 1);

    const roomTypes = await this.prisma.roomType.findMany({
      where: { tenantId, active: true, propertyId: q.propertyId, id: q.roomTypeId },
      include: { property: { select: { id: true, name: true } } },
      // Порядок категорий = заданный в «Номерном фонде» (перетаскивание), затем имя.
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (roomTypes.length === 0) return [];
    const typeIds = roomTypes.map((rt) => rt.id);

    const rooms = await this.prisma.room.findMany({
      // Только жёсткий OOO выбывает из пула; мягкий OUT_OF_SERVICE (§7-C) остаётся продаваемым.
      where: { tenantId, roomTypeId: { in: typeIds }, active: true, sellStatus: 'SELLABLE', maintenanceStatus: { not: 'OUT_OF_ORDER' } },
      select: { id: true, roomTypeId: true },
      // Порядок выдачи номеров = заданный в «Номерном фонде» (sortOrder), затем номер.
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
    });
    const poolByType = new Map<string, string[]>();
    const typeByRoom = new Map<string, string>();
    for (const r of rooms) {
      const arr = poolByType.get(r.roomTypeId) ?? [];
      arr.push(r.id);
      poolByType.set(r.roomTypeId, arr);
      typeByRoom.set(r.id, r.roomTypeId);
    }

    const [bookings, locks, blocks] = await Promise.all([
      this.prisma.booking.findMany({
        where: { tenantId, roomTypeId: { in: typeIds }, status: { in: OCCUPYING_STATUSES }, checkIn: { lt: coDate }, checkOut: { gt: ciDate } },
        select: { roomTypeId: true, checkIn: true, checkOut: true },
      }),
      this.prisma.inventoryLock.findMany({
        where: { tenantId, roomTypeId: { in: typeIds }, status: 'ACTIVE', expiresAt: { gt: new Date() }, checkIn: { lt: coDate }, checkOut: { gt: ciDate } },
        select: { roomTypeId: true, checkIn: true, checkOut: true, quantity: true },
      }),
      this.prisma.roomBlock.findMany({
        where: { tenantId, active: true, roomId: { in: rooms.map((r) => r.id) }, from: { lt: coDate }, to: { gt: ciDate } },
        select: { roomId: true, from: true, to: true },
      }),
    ]);

    return roomTypes
      .filter((rt) => rt.capacity >= occupancy)
      .map((rt) => {
        const pool = poolByType.get(rt.id) ?? [];
        const intervals: OccupancyInterval[] = [];
        for (const b of bookings) if (b.roomTypeId === rt.id) intervals.push({ start: toUtcDay(b.checkIn), end: toUtcDay(b.checkOut), weight: 1 });
        for (const l of locks) if (l.roomTypeId === rt.id) intervals.push({ start: toUtcDay(l.checkIn), end: toUtcDay(l.checkOut), weight: l.quantity });
        for (const bl of blocks) if (typeByRoom.get(bl.roomId) === rt.id) intervals.push({ start: toUtcDay(bl.from), end: toUtcDay(bl.to), weight: 1 });
        const available = Math.max(0, pool.length - maxNightlyOccupancy(nights, intervals));
        return {
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          propertyId: rt.property.id,
          propertyName: rt.property.name,
          capacity: rt.capacity,
          totalRooms: pool.length,
          available,
          nights: nights.length,
        };
      });
  }

  /**
   * Анти-овербукинг внутри транзакции брони/лока. Блокирует строки номеров категории
   * (`FOR UPDATE`) — конкурентные создания сериализуются на них и перечитывают актуальную
   * занятость. Бросает `409 Conflict`, если доступности нет. Вызывать ТОЛЬКО внутри `$transaction`.
   */
  async assertAndLockForBooking(tx: Prisma.TransactionClient, params: BookingAvailabilityParams): Promise<void> {
    const { tenantId, propertyId, roomTypeId, roomId, checkIn, checkOut, roomsCount = 1, excludeBookingId } = params;
    const nights = rangeNights(checkIn, checkOut);
    if (nights.length === 0) throw new BadRequestException('Дата выезда должна быть позже даты заезда');
    const ciDate = new Date(toUtcDay(checkIn));
    const coDate = new Date(toUtcDay(checkOut));
    const excludeId = excludeBookingId ? { not: excludeBookingId } : undefined;

    if (roomId) {
      // Конкретный номер: блокируем его строку и запрещаем пересекающиеся продажи (DHP §15).
      const rows = await tx.$queryRaw<{ id: string; sell: string; maint: string; active: boolean }[]>`
        SELECT id, "sellStatus" AS sell, "maintenanceStatus" AS maint, "active" AS active
        FROM "rooms"
        WHERE id = ${roomId} AND "tenantId" = ${tenantId} AND "roomTypeId" = ${roomTypeId}
        FOR UPDATE`;
      const room = rows[0];
      if (!room) throw new ConflictException('Номер не найден в выбранной категории');
      if (!room.active || room.sell !== 'SELLABLE' || room.maint !== 'OK') throw new ConflictException('Номер недоступен для продажи');

      const clash = await tx.booking.findFirst({
        where: { tenantId, roomId, id: excludeId, status: { in: OCCUPYING_STATUSES }, checkIn: { lt: coDate }, checkOut: { gt: ciDate } },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Номер уже занят на выбранные даты');

      const blocked = await tx.roomBlock.findFirst({
        where: { roomId, active: true, from: { lt: coDate }, to: { gt: ciDate } },
        select: { id: true },
      });
      if (blocked) throw new ConflictException('Номер заблокирован на выбранные даты');
      return;
    }

    // Категория целиком: блокируем все продаваемые номера типа (сериализация конкурентов).
    const pool = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "rooms"
      WHERE "tenantId" = ${tenantId} AND "roomTypeId" = ${roomTypeId}
        AND "active" = true AND "sellStatus" = 'SELLABLE' AND "maintenanceStatus" <> 'OUT_OF_ORDER'
      FOR UPDATE`;
    const totalSellable = pool.length;
    if (totalSellable === 0) throw new ConflictException('Нет продаваемых номеров в выбранной категории');
    const poolIds = pool.map((p) => p.id);

    const [bookings, locks, blocks] = await Promise.all([
      tx.booking.findMany({
        where: { tenantId, roomTypeId, id: excludeId, status: { in: OCCUPYING_STATUSES }, checkIn: { lt: coDate }, checkOut: { gt: ciDate } },
        select: { checkIn: true, checkOut: true },
      }),
      tx.inventoryLock.findMany({
        where: { tenantId, roomTypeId, status: 'ACTIVE', expiresAt: { gt: new Date() }, checkIn: { lt: coDate }, checkOut: { gt: ciDate } },
        select: { checkIn: true, checkOut: true, quantity: true },
      }),
      tx.roomBlock.findMany({
        where: { roomId: { in: poolIds }, active: true, from: { lt: coDate }, to: { gt: ciDate } },
        select: { from: true, to: true },
      }),
    ]);

    const intervals: OccupancyInterval[] = [
      ...bookings.map((b) => ({ start: toUtcDay(b.checkIn), end: toUtcDay(b.checkOut), weight: 1 })),
      ...locks.map((l) => ({ start: toUtcDay(l.checkIn), end: toUtcDay(l.checkOut), weight: l.quantity })),
      ...blocks.map((bl) => ({ start: toUtcDay(bl.from), end: toUtcDay(bl.to), weight: 1 })),
    ];
    const available = totalSellable - maxNightlyOccupancy(nights, intervals);
    if (available < roomsCount) throw new ConflictException('Нет доступности на выбранные даты');
  }

  /**
   * Автоназначить брони готовый (чистый/проверенный) свободный номер её категории на
   * даты проживания. Используется при выдаче ключа, когда конкретный номер ещё не назначен.
   * Готовый = active + SELLABLE + OK + housekeeping CLEAN/INSPECTED, без пересечений
   * с бронями (по номеру) и блокировками. Анти-овербукинг: пул номеров берётся `FOR UPDATE`.
   * Возвращает id назначенного номера или `null`, если готовых свободных номеров нет.
   */
  async autoAssignReadyRoom(bookingId: string): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { tenantId: true, roomTypeId: true, roomId: true, checkIn: true, checkOut: true },
      });
      if (!b) return null;
      if (b.roomId) return b.roomId; // уже назначен

      const ciDate = new Date(toUtcDay(b.checkIn));
      const coDate = new Date(toUtcDay(b.checkOut));

      // Готовые к заселению номера категории, сериализация конкурентов (FOR UPDATE).
      const pool = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "rooms"
        WHERE "tenantId" = ${b.tenantId} AND "roomTypeId" = ${b.roomTypeId}
          AND "active" = true AND "sellStatus" = 'SELLABLE' AND "maintenanceStatus" <> 'OUT_OF_ORDER'
          AND "housekeepingStatus" IN ('CLEAN', 'INSPECTED')
        ORDER BY "number"
        FOR UPDATE`;
      if (pool.length === 0) return null;
      const poolIds = pool.map((p) => p.id);

      const [busyBookings, blocks] = await Promise.all([
        tx.booking.findMany({
          where: {
            tenantId: b.tenantId,
            roomId: { in: poolIds },
            status: { in: OCCUPYING_STATUSES },
            checkIn: { lt: coDate },
            checkOut: { gt: ciDate },
          },
          select: { roomId: true },
        }),
        tx.roomBlock.findMany({
          where: { roomId: { in: poolIds }, active: true, from: { lt: coDate }, to: { gt: ciDate } },
          select: { roomId: true },
        }),
      ]);
      const busy = new Set<string>();
      for (const x of busyBookings) if (x.roomId) busy.add(x.roomId);
      for (const x of blocks) busy.add(x.roomId);

      const freeId = poolIds.find((id) => !busy.has(id));
      if (!freeId) return null;

      await tx.booking.update({ where: { id: bookingId }, data: { roomId: freeId } });
      await this.audit.record(
        {
          tenantId: b.tenantId,
          actorId: 'system',
          action: 'room_auto_assigned',
          entity: 'Booking',
          entityId: bookingId,
          payload: { roomId: freeId, reason: 'key_issue' },
        },
        tx,
      );
      return freeId;
    });
  }

  // ─── Инвентарные локи (TTL) ───
  async createLock(tenantId: string, dto: CreateLockDto, actorId?: string, idempotencyKey?: string) {
    const nights = rangeNights(dto.checkIn, dto.checkOut);
    if (nights.length === 0) throw new BadRequestException('Дата выезда должна быть позже даты заезда');
    await this.assertCatalog(tenantId, dto.propertyId, dto.roomTypeId, dto.roomId);

    if (idempotencyKey) {
      const existing = await this.prisma.inventoryLock.findFirst({
        where: { tenantId, idempotencyKey, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      });
      if (existing) return existing; // повтор с тем же ключом → тот же живой лок
    }

    const ttlMin = dto.ttlMinutes ?? DEFAULT_LOCK_TTL_MIN;
    const expiresAt = new Date(Date.now() + ttlMin * 60_000);
    const quantity = dto.quantity ?? 1;

    const lock = await this.prisma.$transaction(async (tx) => {
      await this.assertAndLockForBooking(tx, {
        tenantId,
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        roomId: dto.roomId,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        roomsCount: quantity,
      });
      return tx.inventoryLock.create({
        data: {
          tenantId,
          propertyId: dto.propertyId,
          roomTypeId: dto.roomTypeId,
          roomId: dto.roomId ?? null,
          checkIn: new Date(toUtcDay(dto.checkIn)),
          checkOut: new Date(toUtcDay(dto.checkOut)),
          quantity,
          status: 'ACTIVE',
          expiresAt,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'InventoryLock', entityId: lock.id, payload: { roomTypeId: dto.roomTypeId, quantity, expiresAt } });
    return lock;
  }

  async releaseLock(tenantId: string, id: string, actorId?: string) {
    const lock = await this.prisma.inventoryLock.findFirst({ where: { id, tenantId } });
    if (!lock) throw new NotFoundException('Инвентарный лок не найден');
    if (lock.status !== 'ACTIVE') return lock;
    const updated = await this.prisma.inventoryLock.update({ where: { id }, data: { status: 'RELEASED' } });
    await this.audit.record({ tenantId, actorId, action: 'released', entity: 'InventoryLock', entityId: id });
    return updated;
  }

  /** Пометить истёкшие активные локи (вызывается планировщиком). Возвращает число обновлённых. */
  async cleanupExpiredLocks(): Promise<number> {
    const res = await this.prisma.inventoryLock.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return res.count;
  }

  // ─── Блокировки номеров (ручные / технические) ───
  listBlocks(tenantId: string, filters: BlockFilters = {}) {
    return this.prisma.roomBlock.findMany({
      where: { tenantId, active: true, propertyId: filters.propertyId, roomId: filters.roomId },
      include: { room: { select: { id: true, number: true, propertyId: true } } },
      orderBy: { from: 'asc' },
    });
  }

  async createBlock(tenantId: string, dto: CreateBlockDto, actorId?: string) {
    const nights = rangeNights(dto.from, dto.to);
    if (nights.length === 0) throw new BadRequestException('Дата окончания блокировки должна быть позже даты начала');
    const room = await this.prisma.room.findFirst({ where: { id: dto.roomId, tenantId }, select: { propertyId: true } });
    if (!room) throw new BadRequestException('Номер не найден');

    const block = await this.prisma.roomBlock.create({
      data: {
        tenantId,
        propertyId: room.propertyId,
        roomId: dto.roomId,
        type: dto.type ?? 'MAINTENANCE',
        from: new Date(toUtcDay(dto.from)),
        to: new Date(toUtcDay(dto.to)),
        reason: dto.reason ?? null,
        createdBy: actorId ?? null,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'RoomBlock', entityId: block.id, payload: { roomId: dto.roomId, type: block.type, from: dto.from, to: dto.to } });
    return block;
  }

  async removeBlock(tenantId: string, id: string, actorId?: string) {
    const block = await this.prisma.roomBlock.findFirst({ where: { id, tenantId } });
    if (!block) throw new NotFoundException('Блокировка не найдена');
    if (!block.active) return block;
    const updated = await this.prisma.roomBlock.update({ where: { id }, data: { active: false } });
    await this.audit.record({ tenantId, actorId, action: 'unblocked', entity: 'RoomBlock', entityId: id });
    return updated;
  }

  // ─── Вспомогательное ───
  private async assertCatalog(tenantId: string, propertyId: string, roomTypeId: string, roomId?: string) {
    const roomType = await this.prisma.roomType.findFirst({ where: { id: roomTypeId, tenantId }, select: { propertyId: true } });
    if (!roomType) throw new BadRequestException('Категория номера не найдена');
    if (roomType.propertyId !== propertyId) throw new BadRequestException('Категория относится к другому объекту');
    if (roomId) {
      const room = await this.prisma.room.findFirst({ where: { id: roomId, tenantId }, select: { propertyId: true, roomTypeId: true } });
      if (!room) throw new BadRequestException('Номер не найден');
      if (room.propertyId !== propertyId || room.roomTypeId !== roomTypeId) throw new BadRequestException('Номер не соответствует объекту/категории');
    }
  }
}
