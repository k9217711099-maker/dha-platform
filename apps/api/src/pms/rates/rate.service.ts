import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type RatePlan } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { applyAdjustment, dateKey, nightDates, utcMidnight } from './rate.util.js';
import type { BulkPricesDto, BulkRestrictionsDto, CreateRatePlanDto, SetPricesDto, SetRestrictionsDto, UpdateRatePlanDto } from './dto/rate.dto.js';

const MAX_DERIVED_DEPTH = 6;
/** Стандартное время заезда/выезда для расчёта доплат за ранний заезд/поздний выезд. */
const STANDARD_CHECK_IN = '14:00';
const STANDARD_CHECK_OUT = '12:00';

export interface QuoteParams {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  children?: number;
}

export interface NightQuote {
  date: string;
  basePrice: number;
  finalPrice: number;
}

export interface Quote {
  ratePlanId: string;
  ratePlanName: string;
  ratePlanKind: string;
  propertyId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  nights: NightQuote[];
  stayAmount: number;
  totalAmount: number;
  currency: string;
  refundable: boolean;
}

/**
 * Rate Engine (DHP §22). Считает стоимость по ночам, применяет derived-тарифы
 * (цена наследуется от родителя ± корректировка) и проверяет ограничения (min/max stay,
 * stop-sell, closed-to-arrival/departure). Расчёт воспроизводим; итог фиксируется в брони.
 * Промокоды/лояльность/налоги/услуги — Booking Engine (Sprint 5), здесь не считаются.
 */
@Injectable()
export class RateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Тарифные планы ───
  listPlans(tenantId: string, propertyId?: string) {
    return this.prisma.ratePlan.findMany({
      where: { tenantId, propertyId },
      orderBy: [{ propertyId: 'asc' }, { name: 'asc' }],
    });
  }

  async getPlan(tenantId: string, id: string) {
    const plan = await this.prisma.ratePlan.findFirst({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException('Тариф не найден');
    return plan;
  }

  async createPlan(tenantId: string, dto: CreateRatePlanDto, actorId?: string) {
    if (dto.propertyId) {
      const property = await this.prisma.property.findFirst({ where: { id: dto.propertyId, tenantId }, select: { id: true } });
      if (!property) throw new BadRequestException('Объект размещения не найден');
    }
    if (dto.parentRatePlanId) await this.assertDerived(tenantId, dto.propertyId, dto.parentRatePlanId, dto.adjustmentType, dto.adjustmentValue);

    const plan = await this.prisma.ratePlan.create({
      data: {
        tenantId,
        propertyId: dto.propertyId ?? null,
        name: dto.name,
        code: dto.code,
        kind: dto.kind ?? 'FLEXIBLE',
        description: dto.description ?? null,
        refundable: dto.refundable ?? true,
        active: dto.active ?? true,
        availableFrontDesk: dto.availableFrontDesk ?? true,
        availableBookingModule: dto.availableBookingModule ?? true,
        availableOta: dto.availableOta ?? true,
        parentRatePlanId: dto.parentRatePlanId ?? null,
        adjustmentType: dto.adjustmentType ?? null,
        adjustmentValue: dto.adjustmentValue ?? null,
        ...this.planConfig(dto),
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'RatePlan', entityId: plan.id, payload: { code: plan.code, kind: plan.kind } });
    return plan;
  }

  async updatePlan(tenantId: string, id: string, dto: UpdateRatePlanDto, actorId?: string) {
    await this.getPlan(tenantId, id);
    const data: Prisma.RatePlanUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.refundable !== undefined) data.refundable = dto.refundable;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.availableFrontDesk !== undefined) data.availableFrontDesk = dto.availableFrontDesk;
    if (dto.availableBookingModule !== undefined) data.availableBookingModule = dto.availableBookingModule;
    if (dto.availableOta !== undefined) data.availableOta = dto.availableOta;
    if (dto.adjustmentType !== undefined) data.adjustmentType = dto.adjustmentType;
    if (dto.adjustmentValue !== undefined) data.adjustmentValue = dto.adjustmentValue;
    Object.assign(data, this.planConfig(dto));
    const plan = await this.prisma.ratePlan.update({ where: { id }, data });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'RatePlan', entityId: id, payload: { ...dto } });
    return plan;
  }

  /**
   * Удалить тариф. Нельзя, если на него ссылаются брони или он служит родителем
   * для производных тарифов. Цены и ограничения удаляются каскадом в транзакции.
   */
  async deletePlan(tenantId: string, id: string, actorId?: string) {
    const plan = await this.getPlan(tenantId, id);
    const bookings = await this.prisma.booking.count({ where: { tenantId, ratePlanId: id } });
    if (bookings > 0) throw new UnprocessableEntityException({ code: 'rate_plan_in_use', message: `Тариф используется в ${bookings} брон(ях) — удаление запрещено. Деактивируйте его.` });
    const children = await this.prisma.ratePlan.count({ where: { tenantId, parentRatePlanId: id } });
    if (children > 0) throw new UnprocessableEntityException({ code: 'rate_plan_has_children', message: `На тарифе основаны ${children} производных тариф(ов) — сначала измените их родителя.` });
    await this.prisma.$transaction(async (tx) => {
      await tx.restriction.deleteMany({ where: { ratePlanId: id } });
      await tx.ratePrice.deleteMany({ where: { ratePlanId: id } });
      await tx.ratePlan.delete({ where: { id } });
    });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'RatePlan', entityId: id, payload: { name: plan.name } });
    return { ok: true };
  }

  /** Поля полной конфигурации (форма Bnovo) → Prisma. Плоские значения валидны и для create, и для update. */
  private planConfig(d: Partial<CreateRatePlanDto>): Partial<Prisma.RatePlanUncheckedCreateInput> {
    const o: Partial<Prisma.RatePlanUncheckedCreateInput> = {};
    if (d.priceMode !== undefined) o.priceMode = d.priceMode || null;
    if (d.priceRounding !== undefined) o.priceRounding = d.priceRounding || null;
    if (d.restrictionMode !== undefined) o.restrictionMode = d.restrictionMode || null;
    if (d.defaultRestriction !== undefined) o.defaultRestriction = d.defaultRestriction || null;
    if (d.meals !== undefined) o.meals = (d.meals as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (d.includedServices !== undefined) o.includedServices = (d.includedServices as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (d.earlyLateMode !== undefined) o.earlyLateMode = d.earlyLateMode || null;
    if (d.earlyLateApplyMain !== undefined) o.earlyLateApplyMain = d.earlyLateApplyMain;
    if (d.freeCancelDays !== undefined) o.freeCancelDays = d.freeCancelDays ?? null;
    if (d.cancellationComment !== undefined) o.cancellationComment = d.cancellationComment || null;
    if (d.rulePeriods !== undefined) o.rulePeriods = (d.rulePeriods as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (d.guaranteeType !== undefined) o.guaranteeType = d.guaranteeType || null;
    if (d.releaseOpenDays !== undefined) o.releaseOpenDays = d.releaseOpenDays ?? null;
    if (d.releaseOpenHours !== undefined) o.releaseOpenHours = d.releaseOpenHours ?? null;
    if (d.releaseCloseDays !== undefined) o.releaseCloseDays = d.releaseCloseDays ?? null;
    if (d.releaseCloseHours !== undefined) o.releaseCloseHours = d.releaseCloseHours ?? null;
    if (d.defaultMinNights !== undefined) o.defaultMinNights = d.defaultMinNights ?? null;
    if (d.restrictionCategoryIds !== undefined) o.restrictionCategoryIds = (d.restrictionCategoryIds as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (d.earlyLateConfig !== undefined) o.earlyLateConfig = (d.earlyLateConfig as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (d.guaranteeConfig !== undefined) o.guaranteeConfig = (d.guaranteeConfig as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    return o;
  }

  // ─── Цены и ограничения (bulk по диапазону дат) ───
  async setPrices(tenantId: string, dto: SetPricesDto, actorId?: string) {
    const nights = nightDates(dto.from, dto.to);
    if (nights.length === 0) throw new BadRequestException('Дата окончания должна быть позже даты начала');
    await this.getPlan(tenantId, dto.ratePlanId);
    await this.assertRoomType(tenantId, dto.roomTypeId);

    await this.prisma.$transaction(
      nights.map((date) =>
        this.prisma.ratePrice.upsert({
          where: { ratePlanId_roomTypeId_date: { ratePlanId: dto.ratePlanId, roomTypeId: dto.roomTypeId, date } },
          create: { tenantId, ratePlanId: dto.ratePlanId, roomTypeId: dto.roomTypeId, date, price: dto.price },
          update: { price: dto.price },
        }),
      ),
    );
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'RatePrice', entityId: dto.ratePlanId, payload: { roomTypeId: dto.roomTypeId, from: dto.from, to: dto.to, price: dto.price, nights: nights.length } });
    return { updated: nights.length };
  }

  /**
   * Массовое изменение цен на период(ы): N категорий × периоды × дни недели × режим
   * (новое значение / ±% / ±₽). Для относительных режимов берётся текущая цена ночи
   * (нет цены — ночь пропускается). Один проход по всем ночам, upsert в транзакции.
   */
  async bulkPrices(tenantId: string, dto: BulkPricesDto, actorId?: string) {
    await this.getPlan(tenantId, dto.ratePlanId);
    const wd = dto.weekdays && dto.weekdays.length ? new Set(dto.weekdays) : null;
    // Собираем уникальные ночи по всем периодам, отфильтрованные по дням недели.
    const nightSet = new Map<string, Date>();
    for (const p of dto.periods) {
      for (const d of nightDates(p.from, p.to)) {
        if (wd && !wd.has(d.getUTCDay())) continue;
        nightSet.set(dateKey(d), d);
      }
    }
    const nights = [...nightSet.values()];
    if (nights.length === 0) throw new BadRequestException('Не выбрано ни одной ночи (проверьте периоды и дни недели)');

    let updated = 0;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const roomTypeId of dto.roomTypeIds) {
      await this.assertRoomType(tenantId, roomTypeId);
      // Текущие цены нужны только для относительных режимов.
      const current = dto.mode === 'set'
        ? new Map<string, number>()
        : new Map((await this.prisma.ratePrice.findMany({ where: { ratePlanId: dto.ratePlanId, roomTypeId, date: { in: nights } }, select: { date: true, price: true } })).map((r) => [dateKey(r.date), r.price]));
      for (const date of nights) {
        const price = this.applyPriceMode(dto.mode, dto.value, current.get(dateKey(date)));
        if (price === null) continue; // относительный режим без текущей цены — пропускаем
        ops.push(this.prisma.ratePrice.upsert({
          where: { ratePlanId_roomTypeId_date: { ratePlanId: dto.ratePlanId, roomTypeId, date } },
          create: { tenantId, ratePlanId: dto.ratePlanId, roomTypeId, date, price },
          update: { price },
        }));
        updated++;
      }
    }
    await this.prisma.$transaction(ops);
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'RatePrice', entityId: dto.ratePlanId, payload: { bulk: true, categories: dto.roomTypeIds.length, mode: dto.mode, value: dto.value, updated } });
    return { updated };
  }

  private applyPriceMode(mode: BulkPricesDto['mode'], value: number, current?: number): number | null {
    if (mode === 'set') return value;
    if (current == null) return null;
    if (mode === 'inc_abs') return Math.max(0, current + value);
    if (mode === 'dec_abs') return Math.max(0, current - value);
    if (mode === 'inc_pct') return Math.max(0, Math.round(current * (1 + value / 100)));
    if (mode === 'dec_pct') return Math.max(0, Math.round(current * (1 - value / 100)));
    return null;
  }

  async setRestrictions(tenantId: string, dto: SetRestrictionsDto, actorId?: string) {
    const nights = nightDates(dto.from, dto.to);
    if (nights.length === 0) throw new BadRequestException('Дата окончания должна быть позже даты начала');
    await this.getPlan(tenantId, dto.ratePlanId);
    await this.assertRoomType(tenantId, dto.roomTypeId);

    const fields = {
      minStay: dto.minStay,
      minStayArrival: dto.minStayArrival,
      maxStay: dto.maxStay,
      stopSell: dto.stopSell,
      closedToArrival: dto.closedToArrival,
      closedToDeparture: dto.closedToDeparture,
    };
    const provided = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

    await this.prisma.$transaction(
      nights.map((date) =>
        this.prisma.restriction.upsert({
          where: { ratePlanId_roomTypeId_date: { ratePlanId: dto.ratePlanId, roomTypeId: dto.roomTypeId, date } },
          create: { tenantId, ratePlanId: dto.ratePlanId, roomTypeId: dto.roomTypeId, date, ...provided },
          update: provided,
        }),
      ),
    );
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'Restriction', entityId: dto.ratePlanId, payload: { roomTypeId: dto.roomTypeId, from: dto.from, to: dto.to, ...provided, nights: nights.length } });
    return { updated: nights.length };
  }

  /** Массовое обновление ограничений: N тарифов × M категорий × период × дни недели, трёхпозиционно. */
  async bulkRestrictions(tenantId: string, dto: BulkRestrictionsDto, actorId?: string) {
    const allNights = nightDates(dto.from, dto.to);
    if (allNights.length === 0) throw new BadRequestException('Дата окончания должна быть позже даты начала');
    const wd = dto.weekdays && dto.weekdays.length ? new Set(dto.weekdays) : null;
    const nights = wd ? allNights.filter((d) => wd.has(d.getUTCDay())) : allNights;
    if (nights.length === 0) throw new BadRequestException('Под выбранные дни недели не попал ни один день');

    const plans = await this.prisma.ratePlan.findMany({ where: { tenantId, id: { in: dto.ratePlanIds } }, select: { id: true } });
    const types = await this.prisma.roomType.findMany({ where: { tenantId, id: { in: dto.roomTypeIds } }, select: { id: true } });
    if (plans.length !== new Set(dto.ratePlanIds).size) throw new BadRequestException('Некоторые тарифы не найдены');
    if (types.length !== new Set(dto.roomTypeIds).size) throw new BadRequestException('Некоторые категории не найдены');

    const provided: Partial<Prisma.RestrictionUncheckedCreateInput> = {};
    if (dto.sales) provided.stopSell = dto.sales === 'close';
    if (dto.arrival) provided.closedToArrival = dto.arrival === 'close';
    if (dto.departure) provided.closedToDeparture = dto.departure === 'close';
    if (dto.minStay !== undefined) provided.minStay = dto.minStay;
    if (dto.maxStay !== undefined) provided.maxStay = dto.maxStay;
    if (dto.minStayArrival !== undefined) provided.minStayArrival = dto.minStayArrival;
    if (Object.keys(provided).length === 0) throw new BadRequestException('Не заданы ограничения для обновления');

    const ops = dto.ratePlanIds.flatMap((ratePlanId) =>
      dto.roomTypeIds.flatMap((roomTypeId) =>
        nights.map((date) =>
          this.prisma.restriction.upsert({
            where: { ratePlanId_roomTypeId_date: { ratePlanId, roomTypeId, date } },
            create: { tenantId, ratePlanId, roomTypeId, date, ...provided },
            update: provided,
          }),
        ),
      ),
    );
    if (ops.length > 8000) throw new BadRequestException('Слишком большой объём — сократите период или выбор');
    await this.prisma.$transaction(ops);
    await this.audit.record({ tenantId, actorId, action: 'bulk_updated', entity: 'Restriction', entityId: dto.ratePlanIds[0] ?? null, payload: { plans: dto.ratePlanIds.length, roomTypes: dto.roomTypeIds.length, from: dto.from, to: dto.to, weekdays: dto.weekdays ?? 'все', ...provided, cells: ops.length } });
    return { updated: ops.length };
  }

  /** Шахматка ограничений: строки (категории или тарифы) × даты → статус open/closed/restricted. */
  async restrictionsGrid(tenantId: string, params: { propertyId?: string; from: string; to: string; ratePlanId?: string; roomTypeId?: string }) {
    const nights = nightDates(params.from, params.to);
    if (nights.length === 0) throw new BadRequestException('Некорректный период');
    const dateKeys = nights.map((d) => dateKey(d));
    const key = (planId: string, typeId: string, dk: string) => `${planId}:${typeId}:${dk}`;
    // propertyId необязателен: пусто — вся сеть (в названии строки — префикс объекта).
    const propFilter = params.propertyId ? { propertyId: params.propertyId } : {};

    let rows: { id: string; name: string }[];
    let planIds: string[];
    let typeIds: string[];
    if (params.ratePlanId) {
      const t = await this.prisma.roomType.findMany({ where: { tenantId, ...propFilter, active: true }, select: { id: true, name: true, property: { select: { name: true } } }, orderBy: [{ propertyId: 'asc' }, { name: 'asc' }] });
      rows = t.map((x) => ({ id: x.id, name: params.propertyId ? x.name : `${x.property?.name ?? ''} · ${x.name}` }));
      planIds = [params.ratePlanId]; typeIds = t.map((x) => x.id);
    } else if (params.roomTypeId) {
      const p = await this.prisma.ratePlan.findMany({ where: { tenantId, ...propFilter, active: true }, select: { id: true, name: true, property: { select: { name: true } } }, orderBy: [{ propertyId: 'asc' }, { name: 'asc' }] });
      rows = p.map((x) => ({ id: x.id, name: params.propertyId || !x.property ? x.name : `${x.property.name} · ${x.name}` }));
      typeIds = [params.roomTypeId]; planIds = p.map((x) => x.id);
    } else {
      throw new BadRequestException('Укажите тариф или категорию');
    }

    const restrictions = typeIds.length && planIds.length
      ? await this.prisma.restriction.findMany({ where: { tenantId, ratePlanId: { in: planIds }, roomTypeId: { in: typeIds }, date: { gte: nights[0]!, lte: nights[nights.length - 1]! } } })
      : [];
    const map = new Map<string, (typeof restrictions)[number]>();
    for (const r of restrictions) map.set(key(r.ratePlanId, r.roomTypeId, dateKey(r.date)), r);

    const statusOf = (planId: string, typeId: string, dk: string): 'open' | 'closed' | 'restricted' => {
      const r = map.get(key(planId, typeId, dk));
      if (!r) return 'open';
      if (r.stopSell) return 'closed';
      if (r.minStay || r.maxStay || r.minStayArrival || r.closedToArrival || r.closedToDeparture) return 'restricted';
      return 'open';
    };

    return {
      dates: dateKeys,
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        cells: dateKeys.map((dk) => (params.ratePlanId ? statusOf(params.ratePlanId, row.id, dk) : statusOf(row.id, params.roomTypeId!, dk))),
      })),
    };
  }

  /** Тарифный календарь: по датам разрешённая цена + ограничения (для админки/проверки). */
  async calendar(tenantId: string, params: { ratePlanId: string; roomTypeId: string; from: string; to: string }) {
    const nights = nightDates(params.from, params.to);
    if (nights.length === 0) throw new BadRequestException('Дата окончания должна быть позже даты начала');
    const chain = await this.resolvePlanChain(tenantId, params.ratePlanId);
    const priceMaps = await this.priceMap(chain.map((c) => c.id), params.roomTypeId, nights);
    const restrictions = await this.restrictionMap(chain[0]!.id, params.roomTypeId, nights);

    return nights.map((night) => {
      const key = dateKey(night);
      const r = restrictions.get(key);
      return {
        date: key,
        price: this.resolveNightPrice(chain, priceMaps, key),
        minStay: r?.minStay ?? null,
        minStayArrival: r?.minStayArrival ?? null,
        maxStay: r?.maxStay ?? null,
        stopSell: r?.stopSell ?? false,
        closedToArrival: r?.closedToArrival ?? false,
        closedToDeparture: r?.closedToDeparture ?? false,
      };
    });
  }

  // ─── Quote (расчёт цены с проверкой ограничений) ───
  async quote(tenantId: string, p: QuoteParams): Promise<Quote> {
    const nights = nightDates(p.checkIn, p.checkOut);
    if (nights.length === 0) throw new BadRequestException('Дата выезда должна быть позже даты заезда');
    const chain = await this.resolvePlanChain(tenantId, p.ratePlanId);
    const target = chain[0]!;
    if (!target.active) throw new UnprocessableEntityException({ code: 'rate_plan_inactive', message: 'Тариф неактивен' });
    if (target.propertyId && target.propertyId !== p.propertyId) throw new BadRequestException('Тариф относится к другому объекту');
    await this.assertRoomType(tenantId, p.roomTypeId, p.propertyId);

    const priceMaps = await this.priceMap(chain.map((c) => c.id), p.roomTypeId, nights);
    const restrictions = await this.restrictionMap(target.id, p.roomTypeId, nights, p.checkOut);

    const nightQuotes: NightQuote[] = [];
    for (const night of nights) {
      const key = dateKey(night);
      if (restrictions.get(key)?.stopSell) throw new UnprocessableEntityException({ code: 'stop_sell_active', message: `Продажи закрыты на ${key}`, date: key });
      const price = this.resolveNightPrice(chain, priceMaps, key);
      if (price === null) throw new UnprocessableEntityException({ code: 'no_price', message: `Нет цены на ${key}`, date: key });
      nightQuotes.push({ date: key, basePrice: price, finalPrice: price });
    }

    // min/max stay + closed-to-arrival — по дате заезда; closed-to-departure — по дате выезда.
    const arrival = restrictions.get(dateKey(nights[0]!));
    if (arrival?.minStay && nights.length < arrival.minStay) throw new UnprocessableEntityException({ code: 'min_stay_failed', message: `Минимальный срок проживания — ${arrival.minStay} ноч.` });
    if (arrival?.maxStay && nights.length > arrival.maxStay) throw new UnprocessableEntityException({ code: 'max_stay_failed', message: `Максимальный срок проживания — ${arrival.maxStay} ноч.` });
    if (arrival?.closedToArrival) throw new UnprocessableEntityException({ code: 'closed_to_arrival', message: `Заезд ${dateKey(p.checkIn)} закрыт` });
    if (restrictions.get(dateKey(p.checkOut))?.closedToDeparture) throw new UnprocessableEntityException({ code: 'closed_to_departure', message: `Выезд ${dateKey(p.checkOut)} закрыт` });

    const stayAmount = nightQuotes.reduce((sum, n) => sum + n.finalPrice, 0);
    return {
      ratePlanId: target.id,
      ratePlanName: target.name,
      ratePlanKind: target.kind,
      propertyId: p.propertyId,
      roomTypeId: p.roomTypeId,
      checkIn: dateKey(p.checkIn),
      checkOut: dateKey(p.checkOut),
      nightsCount: nights.length,
      nights: nightQuotes,
      stayAmount,
      totalAmount: stayAmount,
      currency: 'RUB',
      refundable: target.refundable,
    };
  }

  /**
   * Доплаты за ранний заезд/поздний выезд («процент от суток», DHP). Считаются от
   * стоимости суток (базы) по конфигу `earlyLateConfig` тарифа, когда `earlyLateMode`
   * = PERCENT и время заезда раньше 14:00 / выезда позже 12:00. База (current/prev/next)
   * выбирается из посуточной разбивки проживания. Возвращает суммы и разбивку строк.
   */
  async earlyLateSurcharge(
    tenantId: string,
    ratePlanId: string,
    p: { arrivalTime?: string; departureTime?: string; nights: number[] },
  ): Promise<{ total: number; lines: { type: 'early' | 'late'; percent: number; base: number; amount: number }[] }> {
    const lines: { type: 'early' | 'late'; percent: number; base: number; amount: number }[] = [];
    if (!p.nights.length) return { total: 0, lines };
    const plan = await this.prisma.ratePlan.findFirst({ where: { id: ratePlanId, tenantId } });
    if (!plan || plan.earlyLateMode !== 'PERCENT' || !plan.earlyLateConfig) return { total: 0, lines };
    const cfg = plan.earlyLateConfig as { early?: { percent?: number; base?: string }; late?: { percent?: number; base?: string } };
    const first = p.nights[0]!;
    const last = p.nights[p.nights.length - 1]!;
    const pickBase = (base: string | undefined, side: 'early' | 'late'): number => {
      const idxNext = side === 'early' ? Math.min(1, p.nights.length - 1) : p.nights.length - 1;
      const idxPrev = side === 'early' ? 0 : Math.max(0, p.nights.length - 2);
      if (base === 'next') return p.nights[idxNext]!;
      if (base === 'prev') return p.nights[idxPrev]!;
      return side === 'early' ? first : last; // current
    };
    if (p.arrivalTime && p.arrivalTime < STANDARD_CHECK_IN && cfg.early?.percent) {
      const base = pickBase(cfg.early.base, 'early');
      lines.push({ type: 'early', percent: cfg.early.percent, base, amount: Math.round((cfg.early.percent / 100) * base) });
    }
    if (p.departureTime && p.departureTime > STANDARD_CHECK_OUT && cfg.late?.percent) {
      const base = pickBase(cfg.late.base, 'late');
      lines.push({ type: 'late', percent: cfg.late.percent, base, amount: Math.round((cfg.late.percent / 100) * base) });
    }
    return { total: lines.reduce((s, l) => s + l.amount, 0), lines };
  }

  // ─── Вспомогательное ───
  /** Цепочка тарифов [target, parent, … root] по parentRatePlanId (с защитой от циклов). */
  private async resolvePlanChain(tenantId: string, planId: string): Promise<RatePlan[]> {
    const chain: RatePlan[] = [];
    let currentId: string | null = planId;
    for (let depth = 0; currentId && depth < MAX_DERIVED_DEPTH; depth++) {
      const plan: RatePlan | null = await this.prisma.ratePlan.findFirst({ where: { id: currentId, tenantId } });
      if (!plan) {
        if (depth === 0) throw new NotFoundException('Тариф не найден');
        break; // родитель удалён — обрываем цепочку
      }
      chain.push(plan);
      currentId = plan.parentRatePlanId;
    }
    return chain;
  }

  /** Карта явных цен: planId → (dateKey → price). */
  private async priceMap(planIds: string[], roomTypeId: string, nights: Date[]): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.ratePrice.findMany({
      where: { ratePlanId: { in: planIds }, roomTypeId, date: { in: nights } },
      select: { ratePlanId: true, date: true, price: true },
    });
    const map = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const inner = map.get(row.ratePlanId) ?? new Map<string, number>();
      inner.set(dateKey(row.date), row.price);
      map.set(row.ratePlanId, inner);
    }
    return map;
  }

  /** Карта ограничений целевого тарифа: dateKey → restriction. Включает дату выезда (для CTD). */
  private async restrictionMap(ratePlanId: string, roomTypeId: string, nights: Date[], checkOut?: string) {
    const dates = checkOut ? [...nights, utcMidnight(checkOut)] : nights;
    const rows = await this.prisma.restriction.findMany({
      where: { ratePlanId, roomTypeId, date: { in: dates } },
    });
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) map.set(dateKey(row.date), row);
    return map;
  }

  /** Цена ночи: первый тариф в цепочке с явной ценой, затем корректировки потомков (parent→child). */
  private resolveNightPrice(chain: RatePlan[], priceMaps: Map<string, Map<string, number>>, key: string): number | null {
    for (let i = 0; i < chain.length; i++) {
      const explicit = priceMaps.get(chain[i]!.id)?.get(key);
      if (explicit === undefined) continue;
      let price = explicit;
      for (let j = i - 1; j >= 0; j--) {
        const child = chain[j]!;
        if (child.adjustmentType && child.adjustmentValue !== null) price = applyAdjustment(price, child.adjustmentType, child.adjustmentValue);
      }
      return price;
    }
    return null;
  }

  private async assertDerived(tenantId: string, propertyId: string | undefined, parentId: string, adjustmentType?: string, adjustmentValue?: number) {
    const parent = await this.prisma.ratePlan.findFirst({ where: { id: parentId, tenantId }, select: { propertyId: true } });
    if (!parent) throw new BadRequestException('Родительский тариф не найден');
    if (parent.propertyId !== propertyId) throw new BadRequestException('Родительский тариф относится к другому объекту');
    if (!adjustmentType || adjustmentValue === undefined) throw new BadRequestException('Для производного тарифа укажите тип и величину корректировки');
  }

  private async assertRoomType(tenantId: string, roomTypeId: string, propertyId?: string) {
    const roomType = await this.prisma.roomType.findFirst({ where: { id: roomTypeId, tenantId }, select: { propertyId: true } });
    if (!roomType) throw new BadRequestException('Категория номера не найдена');
    if (propertyId && roomType.propertyId !== propertyId) throw new BadRequestException('Категория относится к другому объекту');
  }
}
