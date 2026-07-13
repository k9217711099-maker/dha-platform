import { Injectable } from '@nestjs/common';
import { Prisma, WhNormUnit } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CreateNormDto, UpdateNormDto } from '../dto/warehouse.dto.js';

export interface OverspendBase {
  addressId: string;
  from: Date;
  to: Date;
  roomNights: number;
  stays: number;
  guests: number;
  cleanings: number;
}

/** Нормы расхода и отчёт перерасхода относительно нормы (§7, §6.7.14). */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  norms() {
    return this.prisma.whConsumptionNorm.findMany({
      orderBy: { createdAt: 'desc' },
      include: { item: { select: { id: true, name: true, unit: true } } },
    });
  }

  createNorm(dto: CreateNormDto) {
    return this.prisma.whConsumptionNorm.create({
      data: {
        itemId: dto.itemId,
        addressId: dto.addressId ?? null,
        roomCategory: dto.roomCategory ?? null,
        unit: dto.unit,
        normQuantity: dto.normQuantity,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        comment: dto.comment ?? null,
      },
    });
  }

  updateNorm(id: string, dto: UpdateNormDto) {
    const data: Prisma.WhConsumptionNormUncheckedUpdateInput = {};
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.normQuantity !== undefined) data.normQuantity = dto.normQuantity;
    if (dto.roomCategory !== undefined) data.roomCategory = dto.roomCategory;
    if (dto.validFrom !== undefined) data.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto.comment !== undefined) data.comment = dto.comment;
    return this.prisma.whConsumptionNorm.update({ where: { id }, data });
  }

  async deleteNorm(id: string): Promise<{ ok: true }> {
    await this.prisma.whConsumptionNorm.delete({ where: { id } });
    return { ok: true };
  }

  // ─── §6.7.12 Стоимость запасов по складам ───
  async stockValue() {
    const balances = await this.prisma.whBalance.findMany({
      include: { warehouse: { select: { id: true, name: true, type: true } } },
    });
    const byWh = new Map<string, { warehouseId: string; name: string; type: string; positions: number; value: number }>();
    for (const b of balances) {
      const cur = byWh.get(b.warehouseId) ?? { warehouseId: b.warehouseId, name: b.warehouse.name, type: b.warehouse.type, positions: 0, value: 0 };
      if (b.quantity > 0) cur.positions += 1;
      cur.value += b.quantity * b.avgCost;
      byWh.set(b.warehouseId, cur);
    }
    return [...byWh.values()].sort((a, b) => b.value - a.value);
  }

  // ─── §6.7.2 Движение товара за период ───
  async movements(params: { from: Date; to: Date; warehouseId?: string; itemId?: string }) {
    const movements = await this.prisma.whMovement.findMany({
      where: { date: { gte: params.from, lte: params.to }, warehouseId: params.warehouseId, itemId: params.itemId },
      orderBy: { date: 'desc' },
      take: 500,
    });
    const itemIds = [...new Set(movements.map((m) => m.itemId))];
    const whIds = [...new Set(movements.map((m) => m.warehouseId))];
    const [items, whs] = await Promise.all([
      this.prisma.whItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }),
      this.prisma.whWarehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, name: true } }),
    ]);
    const im = new Map(items.map((i) => [i.id, i]));
    const wm = new Map(whs.map((w) => [w.id, w]));
    return movements.map((m) => ({
      id: m.id,
      date: m.date,
      documentType: m.documentType,
      itemName: im.get(m.itemId)?.name ?? '—',
      unit: im.get(m.itemId)?.unit ?? '',
      warehouseName: wm.get(m.warehouseId)?.name ?? '—',
      quantityIn: m.quantityIn,
      quantityOut: m.quantityOut,
      amount: m.amount,
    }));
  }

  // ─── §6.7.3/4/5 Расход по адресам / категориям / номенклатуре ───
  async consumption(params: { from: Date; to: Date; groupBy: 'address' | 'category' | 'item' }) {
    const movements = await this.prisma.whMovement.findMany({
      where: { documentType: 'WRITE_OFF', date: { gte: params.from, lte: params.to } },
    });
    const itemIds = [...new Set(movements.map((m) => m.itemId))];
    const addrIds = [...new Set(movements.map((m) => m.addressId).filter((x): x is string => !!x))];
    const [items, addrs] = await Promise.all([
      this.prisma.whItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true, categoryId: true, category: { select: { name: true } } } }),
      addrIds.length ? this.prisma.whAddress.findMany({ where: { id: { in: addrIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const im = new Map(items.map((i) => [i.id, i]));
    const am = new Map(addrs.map((a) => [a.id, a]));

    const groups = new Map<string, { key: string; label: string; quantity: number; amount: number }>();
    for (const m of movements) {
      const item = im.get(m.itemId);
      let key: string;
      let label: string;
      if (params.groupBy === 'item') {
        key = m.itemId;
        label = item?.name ?? '—';
      } else if (params.groupBy === 'category') {
        key = item?.categoryId ?? '—';
        label = item?.category?.name ?? 'Без категории';
      } else {
        key = m.addressId ?? '—';
        label = m.addressId ? (am.get(m.addressId)?.name ?? '—') : 'Центральный / без адреса';
      }
      const g = groups.get(key) ?? { key, label, quantity: 0, amount: 0 };
      g.quantity += m.quantityOut;
      g.amount += m.amount;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.amount - a.amount);
  }

  // ─── §6.7.10 Потери и списания по причинам ───
  async losses(params: { from: Date; to: Date }) {
    const docs = await this.prisma.whDocument.findMany({
      where: { type: 'WRITE_OFF', status: 'POSTED', postedAt: { gte: params.from, lte: params.to } },
      select: { reason: true, amount: true },
    });
    const byReason = new Map<string, { reason: string; count: number; amount: number }>();
    for (const d of docs) {
      const reason = d.reason ?? 'OTHER';
      const cur = byReason.get(reason) ?? { reason, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += d.amount;
      byReason.set(reason, cur);
    }
    return [...byReason.values()].sort((a, b) => b.amount - a.amount);
  }

  // ─── §6.7.6 Товары ниже минимального остатка ───
  async lowStock() {
    const balances = await this.prisma.whBalance.findMany({
      include: { item: { select: { id: true, name: true, unit: true, minStock: true } } },
    });
    const byItem = new Map<string, { itemId: string; name: string; unit: string; minStock: number | null; quantity: number }>();
    for (const b of balances) {
      const cur = byItem.get(b.itemId) ?? { itemId: b.itemId, name: b.item.name, unit: b.item.unit, minStock: b.item.minStock, quantity: 0 };
      cur.quantity += b.quantity - b.reserved;
      byItem.set(b.itemId, cur);
    }
    return [...byItem.values()].filter((i) => i.minStock != null && i.quantity < i.minStock).sort((a, b) => a.quantity - b.quantity);
  }

  // ─── §6.7.7/8 Истекающий срок годности и просроченные ───
  async expiry(days: number) {
    const balances = await this.prisma.whBalance.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { not: null } },
      include: { item: { select: { name: true, unit: true } }, warehouse: { select: { name: true } } },
    });
    const now = Date.now();
    const horizon = now + days * 86400000;
    return balances
      .filter((b) => b.expiryDate != null && b.expiryDate.getTime() <= horizon)
      .map((b) => ({
        itemName: b.item.name,
        unit: b.item.unit,
        warehouseName: b.warehouse.name,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        daysLeft: Math.floor(((b.expiryDate as Date).getTime() - now) / 86400000),
        expired: (b.expiryDate as Date).getTime() < now,
      }))
      .sort((a, b) => (a.expiryDate as Date).getTime() - (b.expiryDate as Date).getTime());
  }

  // ─── §6.7.13 Заявки и скорость их обработки ───
  async requestsReport() {
    const reqs = await this.prisma.whReplenishmentRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return reqs.map((r) => ({
      number: r.number,
      status: r.status,
      priority: r.priority,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      processingHours: r.approvedAt ? Math.round(((r.approvedAt.getTime() - r.createdAt.getTime()) / 3600000) * 10) / 10 : null,
    }));
  }

  // ─── §6.7.9 Инвентаризационные расхождения ───
  async inventoryDiffs() {
    const invs = await this.prisma.whInventory.findMany({
      where: { status: 'POSTED' },
      orderBy: { finishedAt: 'desc' },
      include: { lines: { include: { item: { select: { name: true, unit: true } } } } },
      take: 50,
    });
    const rows: { inventory: string; itemName: string; unit: string; book: number; fact: number; deviation: number; deviationMoney: number }[] = [];
    for (const inv of invs) {
      for (const l of inv.lines) {
        if (l.factQuantity == null || l.factQuantity === l.bookQuantity) continue;
        const deviation = l.factQuantity - l.bookQuantity;
        rows.push({ inventory: inv.number, itemName: l.item.name, unit: l.item.unit, book: l.bookQuantity, fact: l.factQuantity, deviation, deviationMoney: deviation * l.price });
      }
    }
    return rows;
  }

  /**
   * Перерасход по адресу за период: нормативный расход (норма × база) против фактического
   * (списания со складов адреса). База (номеро-сутки и т.п.) вводится вручную, позже — из PMS (§8.3).
   */
  async overspend(params: OverspendBase) {
    const base: Record<WhNormUnit, number> = {
      ROOM_NIGHT: params.roomNights,
      STAY: params.stays,
      GUEST: params.guests,
      CLEANING: params.cleanings,
      PLACE: params.roomNights,
      MONTH: 1,
    };

    // Применимые нормы: для адреса или общие (addressId = null); адресная важнее общей.
    const norms = await this.prisma.whConsumptionNorm.findMany({
      where: { OR: [{ addressId: params.addressId }, { addressId: null }] },
      include: { item: { select: { id: true, name: true, unit: true } } },
    });
    const byItem = new Map<string, (typeof norms)[number]>();
    for (const n of norms) {
      const cur = byItem.get(n.itemId);
      if (!cur || (n.addressId === params.addressId && cur.addressId == null)) byItem.set(n.itemId, n);
    }
    const effective = [...byItem.values()];

    // Фактический расход = списания (WRITE_OFF) на складах адреса за период.
    const whs = await this.prisma.whWarehouse.findMany({ where: { addressId: params.addressId }, select: { id: true } });
    const whIds = whs.map((w) => w.id);
    const movements = whIds.length
      ? await this.prisma.whMovement.findMany({
          where: { warehouseId: { in: whIds }, documentType: 'WRITE_OFF', date: { gte: params.from, lte: params.to } },
        })
      : [];
    const actualByItem = new Map<string, number>();
    for (const m of movements) actualByItem.set(m.itemId, (actualByItem.get(m.itemId) ?? 0) + m.quantityOut);

    return effective.map((n) => {
      const normative = n.normQuantity * (base[n.unit] ?? 0);
      const actual = actualByItem.get(n.itemId) ?? 0;
      const overspend = actual - normative;
      return {
        itemId: n.itemId,
        name: n.item.name,
        unit: n.item.unit,
        norm: n.normQuantity,
        normUnit: n.unit,
        normative,
        actual,
        overspend,
        overspent: overspend > 0,
      };
    });
  }
}
