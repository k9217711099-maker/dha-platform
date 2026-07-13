import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ScopeService } from '../scope.service.js';

const DAY = 86400000;

/** Главная панель склада (§6.1). Скоуп по доступным адресам, стоимость — по праву wh_costs. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async summary(adminId: string, canSeeCosts: boolean) {
    const allowed = await this.scope.allowedAddressIds(adminId);
    const balWhere: Prisma.WhBalanceWhereInput = allowed.length
      ? { warehouse: { addressId: { in: allowed } } }
      : {};

    const balances = await this.prisma.whBalance.findMany({
      where: balWhere,
      include: { item: { select: { id: true, name: true, unit: true, minStock: true } } },
    });

    const totalStockValue = balances.reduce((s, b) => s + b.quantity * b.avgCost, 0);
    const positionsCount = balances.filter((b) => b.quantity > 0).length;

    // Ниже минимума: по сумме доступного в скоупе адресов
    const byItem = new Map<string, { name: string; qty: number; minStock: number | null }>();
    for (const b of balances) {
      const cur = byItem.get(b.itemId) ?? { name: b.item.name, qty: 0, minStock: b.item.minStock };
      cur.qty += b.quantity - b.reserved;
      byItem.set(b.itemId, cur);
    }
    const lowStock = [...byItem.values()].filter((i) => i.minStock != null && i.qty < i.minStock);

    const now = Date.now();
    const expiringCount = balances.filter(
      (b) => b.quantity > 0 && b.expiryDate != null && b.expiryDate.getTime() - now <= 30 * DAY,
    ).length;

    const urgentRequests = await this.prisma.whReplenishmentRequest.count({
      where: {
        priority: 'URGENT',
        status: { in: ['SUBMITTED', 'APPROVED', 'IN_PROGRESS'] },
        ...(allowed.length ? { addressId: { in: allowed } } : {}),
      },
    });

    // Последние движения (§6.1) с именами позиций и складов
    const moveWhere: Prisma.WhMovementWhereInput = allowed.length ? { addressId: { in: allowed } } : {};
    const movements = await this.prisma.whMovement.findMany({ where: moveWhere, orderBy: { date: 'desc' }, take: 10 });
    const itemIds = [...new Set(movements.map((m) => m.itemId))];
    const whIds = [...new Set(movements.map((m) => m.warehouseId))];
    const [items, whs] = await Promise.all([
      this.prisma.whItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }),
      this.prisma.whWarehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, name: true } }),
    ]);
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const whMap = new Map(whs.map((w) => [w.id, w]));
    const recentMovements = movements.map((m) => ({
      id: m.id,
      date: m.date,
      documentType: m.documentType,
      itemName: itemMap.get(m.itemId)?.name ?? '—',
      unit: itemMap.get(m.itemId)?.unit ?? '',
      warehouseName: whMap.get(m.warehouseId)?.name ?? '—',
      quantityIn: m.quantityIn,
      quantityOut: m.quantityOut,
    }));

    return {
      totalStockValue: canSeeCosts ? totalStockValue : null,
      positionsCount,
      belowMinCount: lowStock.length,
      expiringCount,
      urgentRequests,
      lowStock: lowStock.slice(0, 10).map((i) => ({ name: i.name, qty: i.qty, minStock: i.minStock })),
      recentMovements,
    };
  }
}
