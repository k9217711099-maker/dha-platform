import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { BnovoCalendarDay, BnovoRatePlan } from '../integrations/bnovo/bnovo.types.js';
import { AvailabilityService as PmsAvailabilityService } from '../pms/availability/availability.service.js';
import { RateService } from '../pms/rates/rate.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { toUtcDay } from '../pms/availability/availability.util.js';
import { dateKey } from '../pms/rates/rate.util.js';

export interface AvailabilityQuery {
  propertyId?: string;
  checkIn: string;
  checkOut: string;
  /** Взрослые. */
  guests?: number;
  /** Дети (учитываются в вместимости номера). */
  children?: number;
}

export interface CalendarQuery {
  propertyId?: string;
  roomTypeId?: string;
  from: string;
  days: number;
  guests?: number;
  children?: number;
}

export interface RoomAvailability {
  roomTypeId: string;
  roomTypeName: string;
  propertyId: string;
  propertyName: string;
  capacity: number;
  available: number;
  nights: number;
  minNights: number;
  ratePlans: BnovoRatePlan[];
  /** Обогащение из нашей карточки категории (для галереи и модалки). */
  photos: string[];
  amenities: string[];
  areaSqm: number | null;
  bedType: string | null;
  description: string | null;
}

const DAY_MS = 86_400_000;

/**
 * Доступность, цены и тарифы на даты для гостевого модуля — источник истины наш
 * **PMS/Rate Engine** (Путь B), а не Bnovo. Доступность считает Availability Engine
 * (овербукинг невозможен), цену и применимые тарифы — Rate Engine (посуточно, с
 * ограничениями). Результат обогащается нашими карточками категорий (фото/оснащение).
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pmsAvailability: PmsAvailabilityService,
    private readonly rate: RateService,
    private readonly tenant: TenantService,
  ) {}

  async getAvailability(query: AvailabilityQuery): Promise<RoomAvailability[]> {
    if (new Date(query.checkOut) <= new Date(query.checkIn)) {
      throw new BadRequestException('Дата выезда должна быть позже даты заезда');
    }
    const tenantId = await this.tenant.getDefaultTenantId();

    // 1. Доступность категорий (Availability Engine)
    const avail = await this.pmsAvailability.search(tenantId, {
      propertyId: query.propertyId,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guests: query.guests,
      children: query.children,
    });
    const withRooms = avail.filter((a) => a.available > 0);
    if (withRooms.length === 0) return [];

    // 2. Карточки категорий (обогащение) + применимые тарифы
    const roomTypes = await this.prisma.roomType.findMany({
      where: { tenantId, id: { in: withRooms.map((a) => a.roomTypeId) }, active: true },
      select: { id: true, photos: true, amenities: true, areaSqm: true, bedType: true, description: true },
    });
    const rtById = new Map(roomTypes.map((rt) => [rt.id, rt]));
    const plans = (await this.rate.listPlans(tenantId)).filter((p) => p.active && p.availableBookingModule);

    // 3. Для каждой доступной категории считаем цену по каждому применимому тарифу (Rate Engine)
    const result: RoomAvailability[] = [];
    for (const a of withRooms) {
      const rt = rtById.get(a.roomTypeId);
      if (!rt) continue;
      const applicable = plans.filter((p) => p.propertyId === null || p.propertyId === a.propertyId);
      const ratePlans: BnovoRatePlan[] = [];
      for (const plan of applicable) {
        try {
          const q = await this.rate.quote(tenantId, {
            propertyId: a.propertyId,
            roomTypeId: a.roomTypeId,
            ratePlanId: plan.id,
            checkIn: query.checkIn,
            checkOut: query.checkOut,
            guests: query.guests,
            children: query.children,
          });
          ratePlans.push({
            id: plan.id,
            name: q.ratePlanName,
            totalPrice: q.totalAmount,
            perNight: Math.round(q.totalAmount / Math.max(1, q.nightsCount)),
            refundable: q.refundable,
            cancellationPolicy: plan.refundable ? 'Бесплатная отмена по условиям тарифа' : 'Невозвратный тариф',
          });
        } catch {
          // тариф без цены / stop-sell / не проходит min-stay на эти даты — пропускаем
        }
      }
      if (ratePlans.length === 0) continue; // нет цены — не показываем категорию
      ratePlans.sort((x, y) => x.perNight - y.perNight);
      result.push({
        roomTypeId: a.roomTypeId,
        roomTypeName: a.roomTypeName,
        propertyId: a.propertyId,
        propertyName: a.propertyName,
        capacity: a.capacity,
        available: a.available,
        nights: a.nights,
        minNights: 1,
        ratePlans,
        photos: rt.photos,
        amenities: rt.amenities,
        areaSqm: rt.areaSqm,
        bedType: rt.bedType,
        description: rt.description,
      });
    }
    return result;
  }

  /**
   * Календарь цен/доступности на диапазон дат (пикер дат). Доступность — по нашему фонду
   * (пул номеров − брони/локи/блоки на ночь); минимальная цена — из наших тарифных цен.
   */
  async getPriceCalendar(query: CalendarQuery): Promise<BnovoCalendarDay[]> {
    const tenantId = await this.tenant.getDefaultTenantId();
    const days = Math.min(Math.max(query.days, 1), 92);
    const day0 = toUtcDay(query.from);
    const rangeStart = new Date(day0);
    const rangeEnd = new Date(day0 + days * DAY_MS);
    const occupancy = Math.max((query.guests ?? 1) + (query.children ?? 0), 1);

    const roomTypes = await this.prisma.roomType.findMany({
      where: { tenantId, active: true, propertyId: query.propertyId, id: query.roomTypeId },
      select: { id: true, capacity: true },
    });
    const typeIds = roomTypes.map((rt) => rt.id).filter((id) => (roomTypes.find((r) => r.id === id)?.capacity ?? 0) >= occupancy);
    if (typeIds.length === 0) return this.emptyCalendar(day0, days);

    const rooms = await this.prisma.room.findMany({
      where: { tenantId, roomTypeId: { in: typeIds }, active: true, sellStatus: 'SELLABLE', maintenanceStatus: 'OK' },
      select: { id: true, roomTypeId: true },
    });
    const poolByType = new Map<string, number>();
    const typeByRoom = new Map<string, string>();
    for (const r of rooms) { poolByType.set(r.roomTypeId, (poolByType.get(r.roomTypeId) ?? 0) + 1); typeByRoom.set(r.id, r.roomTypeId); }

    const [bookings, locks, blocks, plans] = await Promise.all([
      this.prisma.booking.findMany({
        where: { tenantId, roomTypeId: { in: typeIds }, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] }, checkIn: { lt: rangeEnd }, checkOut: { gt: rangeStart } },
        select: { roomTypeId: true, checkIn: true, checkOut: true },
      }),
      this.prisma.inventoryLock.findMany({
        where: { tenantId, roomTypeId: { in: typeIds }, status: 'ACTIVE', expiresAt: { gt: new Date() }, checkIn: { lt: rangeEnd }, checkOut: { gt: rangeStart } },
        select: { roomTypeId: true, checkIn: true, checkOut: true, quantity: true },
      }),
      this.prisma.roomBlock.findMany({
        where: { tenantId, active: true, roomId: { in: rooms.map((r) => r.id) }, from: { lt: rangeEnd }, to: { gt: rangeStart } },
        select: { roomId: true, from: true, to: true },
      }),
      this.rate.listPlans(tenantId),
    ]);

    // Занятость по (категория, день)
    const occ = new Map<string, number[]>();
    for (const id of typeIds) occ.set(id, new Array(days).fill(0));
    const addOcc = (typeId: string | undefined, from: Date, to: Date, weight: number) => {
      if (!typeId) return;
      const arr = occ.get(typeId);
      if (!arr) return;
      const lo = Math.max(0, Math.round((toUtcDay(from) - day0) / DAY_MS));
      const hi = Math.min(days, Math.round((toUtcDay(to) - day0) / DAY_MS));
      for (let i = lo; i < hi; i++) arr[i] = (arr[i] ?? 0) + weight;
    };
    for (const b of bookings) addOcc(b.roomTypeId, b.checkIn, b.checkOut, 1);
    for (const l of locks) addOcc(l.roomTypeId, l.checkIn, l.checkOut, l.quantity);
    for (const bl of blocks) addOcc(typeByRoom.get(bl.roomId), bl.from, bl.to, 1);

    // Минимальная цена за ночь по дате (из наших тарифных цен применимых тарифов)
    const planIds = plans.filter((p) => p.active && p.availableBookingModule).map((p) => p.id);
    const prices = planIds.length
      ? await this.prisma.ratePrice.findMany({
          where: { tenantId, ratePlanId: { in: planIds }, roomTypeId: { in: typeIds }, date: { gte: rangeStart, lt: rangeEnd } },
          select: { date: true, price: true },
        })
      : [];
    const minPriceByDate = new Map<string, number>();
    for (const p of prices) {
      const k = dateKey(p.date);
      const cur = minPriceByDate.get(k);
      if (cur === undefined || p.price < cur) minPriceByDate.set(k, p.price);
    }

    // Сборка по дням
    const out: BnovoCalendarDay[] = [];
    for (let i = 0; i < days; i++) {
      const date = dateKey(new Date(day0 + i * DAY_MS));
      let available = false;
      for (const id of typeIds) {
        const pool = poolByType.get(id) ?? 0;
        const used = occ.get(id)?.[i] ?? 0;
        if (pool - used >= 1) { available = true; break; }
      }
      out.push({ date, available, minNightlyPrice: available ? (minPriceByDate.get(date) ?? null) : null });
    }
    return out;
  }

  private emptyCalendar(day0: number, days: number): BnovoCalendarDay[] {
    const out: BnovoCalendarDay[] = [];
    for (let i = 0; i < days; i++) out.push({ date: dateKey(new Date(day0 + i * DAY_MS)), available: false, minNightlyPrice: null });
    return out;
  }
}
