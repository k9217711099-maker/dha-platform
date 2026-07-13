import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ScopeService } from '../scope.service.js';

export interface BalanceFilter {
  warehouseId?: string;
  addressId?: string;
  categoryId?: string;
  q?: string;
  zero?: boolean; // включать нулевые остатки
  belowMin?: boolean; // только ниже минимума
  expiringDays?: number; // срок годности ≤ N дней
}

/** Остатки по складам/адресам (§6.3). Скоуп по доступным адресам, цены — по праву wh_costs. */
@Injectable()
export class BalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async list(filter: BalanceFilter, adminId: string, canSeeCosts: boolean) {
    const allowed = await this.scope.allowedAddressIds(adminId);

    const where: Prisma.WhBalanceWhereInput = {};
    if (!filter.zero) where.quantity = { gt: 0 };
    if (filter.warehouseId) where.warehouseId = filter.warehouseId;

    const whFilter: Prisma.WhWarehouseWhereInput = {};
    if (allowed.length) whFilter.addressId = { in: allowed }; // §17.4 — только свои адреса
    if (filter.addressId) whFilter.addressId = filter.addressId;
    if (Object.keys(whFilter).length) where.warehouse = whFilter;
    if (filter.categoryId) where.item = { categoryId: filter.categoryId };

    const rows = await this.prisma.whBalance.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        item: {
          select: { id: true, name: true, sku: true, unit: true, minStock: true, category: { select: { name: true } } },
        },
        warehouse: {
          select: { id: true, name: true, type: true, address: { select: { id: true, name: true } } },
        },
      },
      take: 1000,
    });

    const now = Date.now();
    const expMs = filter.expiringDays ? filter.expiringDays * 86400000 : null;
    const q = filter.q?.toLowerCase();

    return rows
      .filter((r) => {
        if (q && !`${r.item.name} ${r.item.sku ?? ''}`.toLowerCase().includes(q)) return false;
        const available = r.quantity - r.reserved;
        if (filter.belowMin && !(r.item.minStock != null && available < r.item.minStock)) return false;
        if (expMs != null) {
          if (!r.expiryDate) return false;
          if (r.expiryDate.getTime() - now > expMs) return false;
        }
        return true;
      })
      .map((r) => {
        const available = r.quantity - r.reserved;
        return {
          id: r.id,
          warehouseId: r.warehouseId,
          warehouseName: r.warehouse.name,
          warehouseType: r.warehouse.type,
          addressId: r.warehouse.address?.id ?? null,
          addressName: r.warehouse.address?.name ?? null,
          itemId: r.itemId,
          itemName: r.item.name,
          sku: r.item.sku,
          unit: r.item.unit,
          category: r.item.category?.name ?? null,
          batch: r.batch || null,
          expiryDate: r.expiryDate,
          quantity: r.quantity,
          reserved: r.reserved,
          available,
          minStock: r.item.minStock,
          belowMin: r.item.minStock != null && available < r.item.minStock,
          avgCost: canSeeCosts ? r.avgCost : null,
          amount: canSeeCosts ? r.quantity * r.avgCost : null,
        };
      });
  }
}
