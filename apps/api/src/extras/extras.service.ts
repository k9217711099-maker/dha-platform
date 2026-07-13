import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExtraUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

/** Демо-набор доп-услуг для первого запуска (далее редактируется в админке). */
const SEED: { name: string; description: string; category: string; price: number; unit: ExtraUnit; quantitySelectable?: boolean; maxQty?: number }[] = [
  { name: 'Завтрак', description: 'Завтрак «шведский стол»', category: 'Питание', price: 800, unit: 'PER_PERSON_NIGHT' },
  { name: 'Ранний заезд', description: 'Заселение с 09:00', category: 'Заезд и выезд', price: 1500, unit: 'PER_STAY' },
  { name: 'Поздний выезд', description: 'Выезд до 18:00', category: 'Заезд и выезд', price: 1500, unit: 'PER_STAY' },
  { name: 'Парковка', description: 'Охраняемое машино-место', category: 'Транспорт', price: 500, unit: 'PER_NIGHT' },
  { name: 'Трансфер из аэропорта', description: 'Встреча и трансфер', category: 'Транспорт', price: 2500, unit: 'PER_STAY' },
  { name: 'Детская кроватка', description: 'Кроватка для малыша', category: 'Для детей', price: 700, unit: 'PER_STAY' },
  { name: 'Доп. полотенца', description: 'Комплект полотенец', category: 'Сервис', price: 200, unit: 'PER_STAY', quantitySelectable: true, maxQty: 5 },
];

/** Стоимость позиции доп-услуги по единице расчёта. Чистая функция. */
export function computeExtraTotal(
  unit: ExtraUnit,
  price: number,
  qty: number,
  nights: number,
  guests: number,
): number {
  const n = Math.max(nights, 1);
  const g = Math.max(guests, 1);
  switch (unit) {
    case 'PER_NIGHT':
      return price * qty * n;
    case 'PER_PERSON':
      return price * qty * g;
    case 'PER_PERSON_NIGHT':
      return price * qty * g * n;
    case 'PER_STAY':
    default:
      return price * qty;
  }
}

export interface ExtraPeriod {
  from: string;
  until: string;
}
export interface ExtraInput {
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  price: number;
  unit: ExtraUnit;
  maxQty?: number;
  quantitySelectable?: boolean;
  periods?: ExtraPeriod[];
  roomTypeIds?: string[];
  includedRatePlanKinds?: string[];
  sortOrder?: number;
  active?: boolean;
}

/** Доп-услуги (апселлы): конструктор в админке, выбор гостем, привязка к броням. */
@Injectable()
export class ExtrasService implements OnModuleInit {
  private readonly logger = new Logger(ExtrasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const count = await this.prisma.extra.count();
    if (count > 0) return;
    await this.prisma.extra.createMany({
      data: SEED.map((s, i) => ({ ...s, sortOrder: i })),
    });
    this.logger.log(`Демо доп-услуги созданы: ${SEED.length}`);
  }

  listActive() {
    return this.prisma.extra.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }
  list() {
    return this.prisma.extra.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }
  create(dto: ExtraInput) {
    const { periods, ...rest } = dto;
    return this.prisma.extra.create({
      data: {
        ...rest,
        roomTypeIds: dto.roomTypeIds ?? [],
        includedRatePlanKinds: dto.includedRatePlanKinds ?? [],
        periods: (periods ?? []) as unknown as Prisma.InputJsonValue,
      } as Prisma.ExtraUncheckedCreateInput,
    });
  }
  update(id: string, dto: Partial<ExtraInput>) {
    const { periods, ...rest } = dto;
    const data = { ...rest } as Prisma.ExtraUncheckedUpdateInput;
    if (periods !== undefined) data.periods = periods as unknown as Prisma.InputJsonValue;
    return this.prisma.extra.update({ where: { id }, data });
  }
  async remove(id: string): Promise<{ ok: true }> {
    await this.prisma.extra.delete({ where: { id } });
    return { ok: true };
  }

  /** Привязать выбранные услуги к брони; вернуть итоговую сумму услуг, ₽. */
  async attachToBooking(
    bookingId: string,
    selection: { extraId: string; qty?: number }[],
    nights: number,
    guests: number,
  ): Promise<number> {
    if (!selection.length) return 0;
    const ids = selection.map((s) => s.extraId);
    const extras = await this.prisma.extra.findMany({ where: { id: { in: ids }, active: true } });
    const byId = new Map(extras.map((e) => [e.id, e]));

    let total = 0;
    const rows = [];
    for (const sel of selection) {
      const e = byId.get(sel.extraId);
      if (!e) continue;
      const maxQty = e.maxQty && e.maxQty > 0 ? e.maxQty : 99;
      const qty = e.quantitySelectable ? Math.max(1, Math.min(sel.qty ?? 1, maxQty)) : 1;
      const lineTotal = computeExtraTotal(e.unit, e.price, qty, nights, guests);
      total += lineTotal;
      rows.push({ bookingId, extraId: e.id, name: e.name, unit: e.unit, unitPrice: e.price, qty, total: lineTotal });
    }
    if (rows.length) {
      await this.prisma.bookingExtra.createMany({ data: rows });
      await this.prisma.booking.update({ where: { id: bookingId }, data: { extrasTotal: total } });
    }
    return total;
  }
}
