import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingChannel, BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { RateService } from '../rates/rate.service.js';
import { assertTransition, generateBookingNumber, nightsBetween } from './booking.util.js';
import type { BookingExtraInputDto, CancelBookingDto, CheckInDto, CreateBookingDto, UpdateBookingDto } from './dto/booking.dto.js';

const ENDPOINT = 'POST /v1/bookings';

/** Полночь UTC — ключ дня плана уборок (см. OpsTaskService.day). */
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

type Db = PrismaService | Prisma.TransactionClient;

const BOOKING_INCLUDE = {
  property: { select: { id: true, name: true } },
  roomType: { select: { id: true, name: true } },
  room: { select: { id: true, number: true } },
  guest: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  extras: { orderBy: { createdAt: 'asc' } },
  tags: { select: { id: true, name: true, color: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.BookingInclude;

export interface BookingFilters {
  status?: BookingStatus;
  propertyId?: string;
  from?: string;
  to?: string;
}

/**
 * Собственные брони PMS (Путь B / DHP). Создание идемпотентно и транзакционно,
 * дата выезда ночь не занимает, все мутации пишут аудит. Овербукинг невозможен:
 * доступность проверяется через `AvailabilityService.assertAndLockForBooking` ВНУТРИ
 * той же PG-транзакции (`FOR UPDATE` на номерах категории). Цену считает Rate Engine
 * в Sprint 4 (пока — из запроса менеджера).
 */
@Injectable()
export class PmsBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idem: IdempotencyService,
    private readonly availability: AvailabilityService,
    private readonly rates: RateService,
  ) {}

  // ─── Создание (идемпотентно) ───
  async create(tenantId: string, dto: CreateBookingDto, actorId: string | undefined, idempotencyKey: string) {
    if (!idempotencyKey) throw new BadRequestException('Требуется заголовок Idempotency-Key');

    const existing = await this.idem.lookup(tenantId, ENDPOINT, idempotencyKey);
    if (existing?.response) return existing.response; // повтор → исходный результат

    const nights = nightsBetween(dto.checkIn, dto.checkOut);
    await this.assertCatalog(tenantId, dto.propertyId, dto.roomTypeId, dto.roomId);
    // Цена: Rate Engine (по ratePlanId, пересчитывается перед созданием — DHP §16) или ручная.
    const pricing = await this.resolvePricing(tenantId, dto);
    const guest = await this.resolveGuest(tenantId, dto);
    // Доп-услуги → позиции брони (структурные extras с количеством/ценой либо легаси extraIds).
    const extras = await this.resolveExtras(dto.extras, dto.extraIds);
    const extrasTotal = extras.reduce((s, e) => s + e.total, 0);
    // Всего гостей: если переданы взрослые — берём их сумму с детьми, иначе поле guests.
    const guests = dto.adults != null ? dto.adults + (dto.children ?? 0) : dto.guests;

    try {
      const view = await this.prisma.$transaction(async (tx) => {
        // Анти-овербукинг: блокируем строки номеров категории и проверяем доступность
        // на актуальных данных внутри этой же транзакции (DHP: overbooking невозможен).
        await this.availability.assertAndLockForBooking(tx, {
          tenantId,
          propertyId: dto.propertyId,
          roomTypeId: dto.roomTypeId,
          roomId: dto.roomId,
          checkIn: dto.checkIn,
          checkOut: dto.checkOut,
          roomsCount: 1,
        });
        const booking = await tx.booking.create({
          data: {
            tenantId,
            bookingNumber: generateBookingNumber(),
            guestId: guest.id,
            propertyId: dto.propertyId,
            roomTypeId: dto.roomTypeId,
            roomId: dto.roomId ?? null,
            status: BookingStatus.CONFIRMED,
            channel: dto.source ?? BookingChannel.MANAGER,
            checkIn: new Date(dto.checkIn),
            checkOut: new Date(dto.checkOut),
            nights,
            guests,
            adults: dto.adults ?? null,
            children: dto.children ?? null,
            arrivalTime: dto.arrivalTime ?? null,
            departureTime: dto.departureTime ?? null,
            bookingMethod: dto.bookingMethod ?? null,
            referralSource: dto.referralSource ?? null,
            discountReason: dto.discountReason ?? null,
            ratePlanId: pricing.ratePlanId,
            ratePlanName: pricing.ratePlanName,
            totalPrice: pricing.totalPrice,
            priceBreakdown: pricing.priceBreakdown,
            extrasTotal,
            comment: dto.comment ?? null,
          },
        });
        if (extras.length) {
          await tx.bookingExtra.createMany({
            data: extras.map((e) => ({ bookingId: booking.id, extraId: e.extraId, name: e.name, unit: e.unit, unitPrice: e.unitPrice, qty: e.qty, total: e.total })),
          });
        }
        await tx.bookingGuest.create({
          data: { bookingId: booking.id, guestId: guest.id, role: 'main', isPrimary: true },
        });
        const v = await this.viewOf(tx, booking.id);
        await tx.idempotencyKey.create({
          // Даты → ISO-строки: чистый JSON для колонки Json.
          data: { tenantId, endpoint: ENDPOINT, key: idempotencyKey, bookingId: booking.id, response: JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue },
        });
        return v;
      });
      await this.audit.record({
        tenantId, actorId, action: 'created', entity: 'Booking', entityId: view.id,
        payload: { bookingNumber: view.bookingNumber, nights },
      });
      return view;
    } catch (e) {
      // Гонка по ключу идемпотентности — возвращаем уже созданный результат.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.idem.lookup(tenantId, ENDPOINT, idempotencyKey);
        if (again?.response) return again.response;
      }
      throw e;
    }
  }

  /** Итоговая цена брони: Rate Engine (по ratePlanId, с проверкой ограничений) или ручная (totalPrice). */
  private async resolvePricing(tenantId: string, dto: CreateBookingDto): Promise<{
    totalPrice: number;
    ratePlanId: string;
    ratePlanName: string;
    priceBreakdown: Prisma.InputJsonValue | undefined;
  }> {
    if (dto.ratePlanId) {
      const quote = await this.rates.quote(tenantId, {
        propertyId: dto.propertyId,
        roomTypeId: dto.roomTypeId,
        ratePlanId: dto.ratePlanId,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        guests: dto.guests,
      });
      // Доплаты за ранний заезд / поздний выезд («процент от суток», Rate Engine).
      const surch = await this.rates.earlyLateSurcharge(tenantId, quote.ratePlanId, {
        arrivalTime: dto.arrivalTime,
        departureTime: dto.departureTime,
        nights: quote.nights.map((n) => n.finalPrice),
      });
      const total = quote.totalAmount + surch.total;
      return {
        totalPrice: total,
        ratePlanId: quote.ratePlanId,
        ratePlanName: quote.ratePlanName,
        priceBreakdown: { ...quote, surcharges: surch.lines, stayAmount: quote.stayAmount, totalAmount: total } as unknown as Prisma.InputJsonValue,
      };
    }
    if (dto.totalPrice === undefined) {
      throw new BadRequestException('Укажите ratePlanId (Rate Engine посчитает цену) или totalPrice (ручная бронь)');
    }
    return {
      totalPrice: dto.totalPrice,
      ratePlanId: 'manual',
      ratePlanName: dto.ratePlanName ?? 'Ручной тариф',
      priceBreakdown: undefined,
    };
  }

  /**
   * Платёжная сводка брони: итог, оплачено, остаток и требуемая предоплата по гарантии
   * тарифа (аудитория «Физ. лицо»). Предоплата = сумма проживания из гарантии
   * (+ доп-услуги, если включено), но не больше остатка.
   */
  async paymentInfo(tenantId: string, id: string) {
    const b = await this.get(tenantId, id);
    const paidSum = await this.prisma.payment.aggregate({ where: { bookingId: id, status: 'PAID' }, _sum: { amount: true } });
    const total = b.totalPrice + b.extrasTotal;
    const paidAmount = paidSum._sum.amount ?? 0;
    const remaining = Math.max(0, total - paidAmount);

    let prepayment = 0;
    let guarantee: { method?: string; dueTerm?: string; legalEntityId?: string | null } | null = null;
    if (b.ratePlanId && b.ratePlanId !== 'manual') {
      const plan = await this.prisma.ratePlan.findFirst({ where: { id: b.ratePlanId, tenantId } });
      const cfg = plan?.guaranteeConfig as { type?: string; individual?: { method?: string; stayPrepay?: number; extrasPrepay?: boolean; dueTerm?: string; legalEntityId?: string | null } } | null;
      const ind = cfg?.individual;
      if (cfg?.type === 'PREPAY' && ind) {
        const stay = ind.stayPrepay ?? 0;
        const extras = ind.extrasPrepay ? b.extrasTotal : 0;
        prepayment = Math.min(remaining, stay + extras);
        guarantee = { method: ind.method, dueTerm: ind.dueTerm, legalEntityId: ind.legalEntityId ?? null };
      }
    }
    return { total, paid: paidAmount, remaining, prepayment, guarantee };
  }

  // ─── Чтение ───
  list(tenantId: string, filters: BookingFilters = {}) {
    const where: Prisma.BookingWhereInput = { tenantId, status: filters.status, propertyId: filters.propertyId };
    if (filters.from || filters.to) {
      where.checkIn = { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined };
    }
    return this.prisma.booking.findMany({ where, include: BOOKING_INCLUDE, orderBy: { checkIn: 'desc' } });
  }

  async get(tenantId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, tenantId }, include: BOOKING_INCLUDE });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    return booking;
  }

  /** Журнал изменений брони (аудит) с именами исполнителей — вкладка «Журнал» в окне брони. */
  async auditTrail(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const logs = await this.audit.list({ entity: 'Booking', entityId: id, take: 200 });
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x))];
    const actors = actorIds.length
      ? await this.prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
      : [];
    const nameById = new Map(actors.map((a) => [a.id, a.name ?? a.email]));
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      at: l.at,
      actor: l.actorName ?? (l.actorId ? nameById.get(l.actorId) ?? 'Администратор' : 'Система'),
      payload: l.payload,
    }));
  }

  // ─── Жизненный цикл ───
  async update(tenantId: string, id: string, dto: UpdateBookingDto, actorId?: string) {
    const current = await this.get(tenantId, id);
    // «Жёсткие» правки (даты/категория/тариф/номер/статус/цена) — только в статусах до заезда.
    // «Мягкие» (примечание, маркетинг, время заезда/выезда) — в любом статусе (§3).
    const hardChange =
      dto.checkIn !== undefined || dto.checkOut !== undefined || dto.roomTypeId !== undefined ||
      dto.propertyId !== undefined || dto.ratePlanId !== undefined || dto.roomId !== undefined ||
      dto.status !== undefined || dto.totalPrice !== undefined || dto.roomLocked !== undefined;
    if (hardChange) assertTransition(current.status, [BookingStatus.PENDING, BookingStatus.CONFIRMED], 'изменение');

    const checkIn = dto.checkIn ?? current.checkIn.toISOString();
    const checkOut = dto.checkOut ?? current.checkOut.toISOString();
    const datesChanged = dto.checkIn !== undefined || dto.checkOut !== undefined;
    const timesChanged = dto.arrivalTime !== undefined || dto.departureTime !== undefined;
    const roomTypeChanged = dto.roomTypeId !== undefined && dto.roomTypeId !== current.roomTypeId;
    const tariffChanged = dto.ratePlanId !== undefined && dto.ratePlanId !== current.ratePlanId;
    const targetRoomTypeId = dto.roomTypeId ?? current.roomTypeId;
    // Перенос в другой объект (§1): вместе с новой категорией; номер и цена сбрасываются (цена — ручная до пересчёта).
    const targetPropertyId = dto.propertyId ?? current.propertyId;
    const propertyChanged = dto.propertyId !== undefined && dto.propertyId !== current.propertyId;
    if (propertyChanged && !roomTypeChanged) throw new BadRequestException('При переносе в другой объект укажите категорию нового объекта.');
    // Смена категории сбрасывает назначенный номер (старый номер — из другой категории).
    const roomChanged = dto.roomId !== undefined || roomTypeChanged;
    const targetRoomId = roomTypeChanged && dto.roomId === undefined ? undefined : (dto.roomId !== undefined ? dto.roomId || undefined : current.roomId ?? undefined);

    // Запрет переселения: если номер зафиксирован — менять номер/категорию нельзя (§ шахматка).
    if (roomChanged && current.roomLocked && targetRoomId !== (current.roomId ?? undefined)) {
      throw new BadRequestException('Переселение запрещено: номер зафиксирован. Снимите блокировку, чтобы сменить номер/категорию.');
    }
    if (roomTypeChanged) await this.assertCatalog(tenantId, targetPropertyId, targetRoomTypeId, targetRoomId);

    const data: Prisma.BookingUpdateInput = {};
    if (datesChanged) {
      data.nights = nightsBetween(checkIn, checkOut);
      data.checkIn = new Date(checkIn);
      data.checkOut = new Date(checkOut);
    }
    if (roomTypeChanged) data.roomType = { connect: { id: targetRoomTypeId } };
    if (propertyChanged) data.property = { connect: { id: targetPropertyId } };
    if (dto.arrivalTime !== undefined) data.arrivalTime = dto.arrivalTime || null;
    if (dto.departureTime !== undefined) data.departureTime = dto.departureTime || null;
    if (dto.guests !== undefined) data.guests = dto.guests;
    if (dto.comment !== undefined) data.comment = dto.comment;
    if (dto.bookingMethod !== undefined) data.bookingMethod = dto.bookingMethod || null;
    if (dto.referralSource !== undefined) data.referralSource = dto.referralSource || null;
    if (dto.discountReason !== undefined) data.discountReason = dto.discountReason || null;
    if (dto.roomLocked !== undefined) data.roomLocked = dto.roomLocked;
    if (dto.status !== undefined) data.status = dto.status as BookingStatus;
    if (roomChanged) data.room = targetRoomId ? { connect: { id: targetRoomId } } : { disconnect: true };

    // Пересчёт цены Rate Engine при смене тарифа/категории/дат/времени (если явно не задан totalPrice).
    const effectiveRatePlanId = dto.ratePlanId ?? current.ratePlanId;
    // При переносе в другой объект тариф может не относиться к нему — по умолчанию цену не трогаем;
    // но если оператор явно выбрал «пересчитать» и передал ratePlanId нового объекта — пересчитываем.
    const needRequote = (tariffChanged || datesChanged || roomTypeChanged || timesChanged) && effectiveRatePlanId !== 'manual' && dto.totalPrice === undefined && (!propertyChanged || dto.ratePlanId !== undefined);
    if (dto.totalPrice !== undefined) {
      data.totalPrice = dto.totalPrice;
      if (tariffChanged && dto.ratePlanId) { data.ratePlanId = dto.ratePlanId; }
    } else if (needRequote) {
      const quote = await this.rates.quote(tenantId, { propertyId: targetPropertyId, roomTypeId: targetRoomTypeId, ratePlanId: effectiveRatePlanId, checkIn, checkOut, guests: dto.guests ?? current.guests });
      const surch = await this.rates.earlyLateSurcharge(tenantId, quote.ratePlanId, {
        arrivalTime: dto.arrivalTime ?? current.arrivalTime ?? undefined,
        departureTime: dto.departureTime ?? current.departureTime ?? undefined,
        nights: quote.nights.map((n) => n.finalPrice),
      });
      data.totalPrice = quote.totalAmount + surch.total;
      data.ratePlanId = quote.ratePlanId;
      data.ratePlanName = quote.ratePlanName;
      data.priceBreakdown = { ...quote, surcharges: surch.lines, totalAmount: quote.totalAmount + surch.total } as unknown as Prisma.InputJsonValue;
    } else if (tariffChanged && dto.ratePlanId) {
      data.ratePlanId = dto.ratePlanId;
    }

    if (datesChanged || roomChanged || roomTypeChanged) {
      // Меняются даты/номер/категория → пересчитываем доступность в транзакции, исключая саму бронь (DHP §19).
      await this.prisma.$transaction(async (tx) => {
        await this.availability.assertAndLockForBooking(tx, {
          tenantId,
          propertyId: targetPropertyId,
          roomTypeId: targetRoomTypeId,
          roomId: targetRoomId,
          checkIn,
          checkOut,
          excludeBookingId: id,
        });
        await tx.booking.update({ where: { id }, data });
      });
    } else {
      await this.prisma.booking.update({ where: { id }, data });
    }
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'Booking', entityId: id, payload: { ...dto } });
    return this.get(tenantId, id);
  }

  async cancel(tenantId: string, id: string, dto: CancelBookingDto, actorId?: string) {
    const current = await this.get(tenantId, id);
    assertTransition(current.status, [BookingStatus.PENDING, BookingStatus.CONFIRMED], 'отмена');
    await this.prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED, cancelReason: dto.reason ?? null } });
    await this.audit.record({ tenantId, actorId, action: 'cancelled', entity: 'Booking', entityId: id, payload: { reason: dto.reason } });
    return this.get(tenantId, id);
  }

  async checkIn(tenantId: string, id: string, dto: CheckInDto, actorId?: string) {
    const current = await this.get(tenantId, id);
    assertTransition(current.status, [BookingStatus.CONFIRMED], 'заезд');
    const roomId = dto.roomId ?? current.roomId ?? undefined;
    await this.prisma.$transaction(async (tx) => {
      // Нельзя заселить в уже занятый/заблокированный номер (DHP §15).
      if (roomId) {
        await this.availability.assertAndLockForBooking(tx, {
          tenantId,
          propertyId: current.propertyId,
          roomTypeId: current.roomTypeId,
          roomId,
          checkIn: current.checkIn,
          checkOut: current.checkOut,
          excludeBookingId: id,
        });
      }
      await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CHECKED_IN, ...(roomId ? { room: { connect: { id: roomId } } } : {}) },
      });
    });
    await this.audit.record({ tenantId, actorId, action: 'checked_in', entity: 'Booking', entityId: id, payload: { roomId } });
    return this.get(tenantId, id);
  }

  async checkOut(tenantId: string, id: string, actorId?: string) {
    const current = await this.get(tenantId, id);
    assertTransition(current.status, [BookingStatus.CHECKED_IN], 'выезд');
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { status: BookingStatus.CHECKED_OUT } });
      // Выезд → номер «грязный» + уборка на выезд (TASKS-HOUSEKEEPING-TZ §6.5): мгновенная
      // задача kind=CLEANING в статусе NEW (видна сразу, без ожидания плана уборок).
      if (current.roomId) {
        await tx.room.update({ where: { id: current.roomId }, data: { housekeepingStatus: 'DIRTY' } });
        const departure = await tx.cleaningType.findFirst({ where: { tenantId, presetKey: 'departure' } });
        await tx.opsTask.create({
          data: {
            tenantId, kind: 'CLEANING', status: 'NEW', title: departure?.name ?? 'Выездная уборка',
            propertyId: current.propertyId, roomId: current.roomId, bookingId: id,
            cleaningTypeId: departure?.id ?? null, planDate: startOfUtcDay(new Date()),
            statusLog: { create: { from: 'NEW', to: 'NEW', actorId: actorId ?? null, note: 'создана при выезде' } },
          },
        });
      }
    });
    await this.audit.record({ tenantId, actorId, action: 'checked_out', entity: 'Booking', entityId: id });
    return this.get(tenantId, id);
  }

  /** Открыть выехавшую бронь обратно (CHECKED_OUT → CHECKED_IN). Право pms_reopen_checkout. */
  async reopenCheckout(tenantId: string, id: string, actorId?: string) {
    const current = await this.get(tenantId, id);
    assertTransition(current.status, [BookingStatus.CHECKED_OUT], 'открыть после выезда');
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { status: BookingStatus.CHECKED_IN } });
      // Авто-уборка на выезд отменяется (§6.5): бронь снова активна.
      const cleanups = await tx.opsTask.findMany({
        where: { tenantId, bookingId: id, kind: 'CLEANING', status: { in: ['PLAN', 'NEW', 'ACCEPTED', 'PAUSED'] } },
      });
      for (const t of cleanups) {
        await tx.opsTask.update({
          where: { id: t.id },
          data: { status: 'CANCELLED', cancelledBy: actorId ?? null, statusLog: { create: { from: t.status, to: 'CANCELLED', actorId: actorId ?? null, note: 'бронь переоткрыта' } } },
        });
      }
    });
    await this.audit.record({ tenantId, actorId, action: 'checkout_reopened', entity: 'Booking', entityId: id });
    return this.get(tenantId, id);
  }

  async noShow(tenantId: string, id: string, actorId?: string) {
    const current = await this.get(tenantId, id);
    assertTransition(current.status, [BookingStatus.CONFIRMED], 'неявка');
    await this.prisma.booking.update({ where: { id }, data: { status: BookingStatus.NO_SHOW } });
    await this.audit.record({ tenantId, actorId, action: 'no_show', entity: 'Booking', entityId: id });
    return this.get(tenantId, id);
  }

  // ─── Вспомогательное ───
  private viewOf(db: Db, id: string) {
    return db.booking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE });
  }

  private async assertCatalog(tenantId: string, propertyId: string, roomTypeId: string, roomId?: string) {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
    if (!property) throw new BadRequestException('Объект размещения не найден');
    const roomType = await this.prisma.roomType.findFirst({ where: { id: roomTypeId, tenantId }, select: { propertyId: true } });
    if (!roomType) throw new BadRequestException('Категория номера не найдена');
    if (roomType.propertyId !== propertyId) throw new BadRequestException('Категория относится к другому объекту');
    if (roomId) await this.assertRoom(tenantId, propertyId, roomId);
  }

  private async assertRoom(tenantId: string, propertyId: string, roomId: string) {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, tenantId }, select: { propertyId: true } });
    if (!room) throw new BadRequestException('Номер не найден');
    if (room.propertyId !== propertyId) throw new BadRequestException('Номер относится к другому объекту');
  }

  /**
   * Доп-услуги брони: структурные позиции (extraId/произвольная услуга + qty + цена)
   * либо легаси-список extraIds (qty=1). Для позиций с extraId имя/единица/цена берутся
   * из каталога, но цену можно переопределить; произвольная позиция требует name+unitPrice.
   */
  private async resolveExtras(extras: BookingExtraInputDto[] | undefined, extraIds: string[] | undefined) {
    const items = extras?.length
      ? extras
      : (extraIds ?? []).map((id) => ({ extraId: id, qty: 1 }) as BookingExtraInputDto);
    if (!items.length) return [];
    const catalogIds = items.map((i) => i.extraId).filter((v): v is string => !!v);
    const catalog = catalogIds.length
      ? await this.prisma.extra.findMany({ where: { id: { in: catalogIds }, active: true } })
      : [];
    const byId = new Map(catalog.map((e) => [e.id, e]));
    const rows: { extraId: string | null; name: string; unit: string; unitPrice: number; qty: number; total: number }[] = [];
    for (const it of items) {
      const cat = it.extraId ? byId.get(it.extraId) : undefined;
      if (it.extraId && !cat) continue; // неизвестный/неактивный id — молча пропускаем
      const name = it.name ?? cat?.name;
      const unitPrice = it.unitPrice ?? cat?.price;
      if (!name || unitPrice == null) {
        if (!it.extraId) throw new BadRequestException('Для произвольной услуги укажите название и цену');
        continue;
      }
      const qty = Math.max(1, it.qty || 1);
      rows.push({ extraId: cat?.id ?? null, name, unit: cat?.unit ?? 'PER_STAY', unitPrice, qty, total: unitPrice * qty });
    }
    return rows;
  }

  /** Добавить доп-услугу к существующей брони и пересчитать extrasTotal. */
  async addExtra(tenantId: string, bookingId: string, dto: BookingExtraInputDto, actorId?: string) {
    await this.get(tenantId, bookingId);
    const [row] = await this.resolveExtras([dto], undefined);
    if (!row) throw new BadRequestException('Не удалось определить услугу');
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingExtra.create({ data: { bookingId, ...row } });
      await this.recomputeExtrasTotal(tx, bookingId);
    });
    await this.audit.record({ tenantId, actorId, action: 'extra_added', entity: 'Booking', entityId: bookingId, payload: { name: row.name, qty: row.qty, total: row.total } });
    return this.get(tenantId, bookingId);
  }

  /** Удалить позицию доп-услуги из брони и пересчитать extrasTotal. */
  async removeExtra(tenantId: string, bookingId: string, extraLineId: string, actorId?: string) {
    await this.get(tenantId, bookingId);
    const line = await this.prisma.bookingExtra.findFirst({ where: { id: extraLineId, bookingId } });
    if (!line) throw new NotFoundException('Позиция услуги не найдена');
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingExtra.delete({ where: { id: extraLineId } });
      await this.recomputeExtrasTotal(tx, bookingId);
    });
    await this.audit.record({ tenantId, actorId, action: 'extra_removed', entity: 'Booking', entityId: bookingId, payload: { name: line.name } });
    return this.get(tenantId, bookingId);
  }

  private async recomputeExtrasTotal(tx: Prisma.TransactionClient, bookingId: string) {
    const agg = await tx.bookingExtra.aggregate({ where: { bookingId }, _sum: { total: true } });
    await tx.booking.update({ where: { id: bookingId }, data: { extrasTotal: agg._sum.total ?? 0 } });
  }

  /** Вернуть заселённую бронь обратно в статус «Проверено» (отмена заселения). */
  async revertCheckIn(tenantId: string, id: string, actorId?: string) {
    const current = await this.get(tenantId, id);
    assertTransition(current.status, [BookingStatus.CHECKED_IN], 'возврат на «Проверено»');
    await this.prisma.booking.update({ where: { id }, data: { status: BookingStatus.CONFIRMED } });
    await this.audit.record({ tenantId, actorId, action: 'checkin_reverted', entity: 'Booking', entityId: id });
    return this.get(tenantId, id);
  }

  /** Гость по guestId (в этом арендаторе) либо найти/создать по контактам. */
  private async resolveGuest(tenantId: string, dto: CreateBookingDto) {
    if (dto.guestId) {
      const g = await this.prisma.guest.findFirst({ where: { id: dto.guestId, tenantId } });
      if (!g) throw new BadRequestException('Гость не найден');
      return g;
    }
    const or: Prisma.GuestWhereInput[] = [];
    if (dto.phone) or.push({ phone: dto.phone });
    if (dto.email) or.push({ email: dto.email });
    if (or.length) {
      const found = await this.prisma.guest.findFirst({ where: { tenantId, OR: or } });
      if (found) return found;
    }
    if (!dto.firstName && !dto.phone && !dto.email) {
      throw new BadRequestException('Укажите гостя: guestId или контакты (имя/телефон/email)');
    }
    return this.prisma.guest.create({
      data: {
        tenant: { connect: { id: tenantId } },
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
      },
    });
  }
}
