import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { InventoryFactLineDto, StartInventoryDto } from '../dto/warehouse.dto.js';
import { INVENTORY_DISCREPANCY_LIMIT } from '../constants.js';

/** Инвентаризация (§5.6): снимок учётного остатка → ввод факта → расхождения → корректировки. */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.whInventory.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
      take: 100,
    });
  }

  async get(id: string) {
    const inv = await this.prisma.whInventory.findUnique({
      where: { id },
      include: { lines: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { id: 'asc' } } },
    });
    if (!inv) throw new NotFoundException('Инвентаризация не найдена');
    const lines = inv.lines.map((l) => {
      const deviation = l.factQuantity == null ? null : l.factQuantity - l.bookQuantity;
      return { ...l, deviation, deviationMoney: deviation == null ? null : deviation * l.price };
    });
    const discrepancyMoney = lines.reduce((s, l) => s + (l.deviationMoney != null ? Math.abs(l.deviationMoney) : 0), 0);
    return { ...inv, lines, discrepancyMoney };
  }

  /** Старт: снимок учётного остатка на момент начала (§5.6). */
  async start(dto: StartInventoryDto, adminId: string) {
    const wh = await this.prisma.whWarehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!wh) throw new BadRequestException('Склад не найден');
    const where: Prisma.WhBalanceWhereInput = {
      warehouseId: dto.warehouseId,
      ...(dto.categoryId ? { item: { categoryId: dto.categoryId } } : {}),
    };
    const balances = await this.prisma.whBalance.findMany({ where });
    if (!balances.length) throw new BadRequestException('Нет остатков для инвентаризации по выбранным параметрам');

    const inv = await this.prisma.whInventory.create({
      data: {
        number: await this.genNumber(),
        warehouseId: dto.warehouseId,
        addressId: wh.addressId,
        status: 'DRAFT',
        authorId: adminId,
        comment: dto.comment ?? null,
        lines: {
          create: balances.map((b) => ({
            itemId: b.itemId,
            batch: b.batch || null,
            expiryKey: b.expiryKey,
            expiryDate: b.expiryDate,
            bookQuantity: b.quantity,
            price: b.avgCost,
            factQuantity: null,
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.record({ actorId: adminId, action: 'created', entity: 'WhInventory', entityId: inv.id, payload: { number: inv.number, lines: inv.lines.length } });
    return this.get(inv.id);
  }

  /** Ввод фактических остатков по строкам. */
  async updateFacts(id: string, lines: InventoryFactLineDto[]) {
    const inv = await this.prisma.whInventory.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Инвентаризация не найдена');
    if (inv.status !== 'DRAFT') throw new BadRequestException('Изменять можно только черновик инвентаризации');
    for (const l of lines) {
      await this.prisma.whInventoryLine.update({
        where: { id: l.lineId },
        data: { factQuantity: l.factQuantity, reason: l.reason ?? undefined },
      });
    }
    return this.get(id);
  }

  /** На согласование: недостачи требуют причину (§5.6). */
  async submit(id: string, adminId: string) {
    const inv = await this.prisma.whInventory.findUnique({ where: { id }, include: { lines: true } });
    if (!inv) throw new NotFoundException('Инвентаризация не найдена');
    if (inv.status !== 'DRAFT') throw new BadRequestException('Отправить можно только черновик');
    for (const l of inv.lines) {
      if (l.factQuantity != null && l.factQuantity - l.bookQuantity < 0 && !l.reason) {
        throw new BadRequestException('Укажите причину недостачи по всем позициям с отрицательным отклонением');
      }
    }
    const updated = await this.prisma.whInventory.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });
    await this.audit.record({ actorId: adminId, action: 'submitted', entity: 'WhInventory', entityId: id, payload: { number: inv.number } });
    return updated;
  }

  /** Утверждение: создаёт документ корректировки и приводит остатки к факту (§5.6). */
  async approve(id: string, adminId: string, perms: string[]) {
    const inv = await this.prisma.whInventory.findUnique({ where: { id }, include: { lines: true } });
    if (!inv) throw new NotFoundException('Инвентаризация не найдена');
    if (inv.status !== 'PENDING_APPROVAL') throw new BadRequestException('Утвердить можно только документ на согласовании');
    if (!inv.warehouseId) throw new BadRequestException('Не указан склад');
    const wh = await this.prisma.whWarehouse.findUnique({ where: { id: inv.warehouseId } });
    if (!wh) throw new BadRequestException('Склад не найден');

    const totalMoney = inv.lines.reduce(
      (s, l) => s + (l.factQuantity != null ? Math.abs(l.factQuantity - l.bookQuantity) * l.price : 0),
      0,
    );
    if (totalMoney > INVENTORY_DISCREPANCY_LIMIT && !perms.includes('wh_approve_writeoff')) {
      throw new ForbiddenException('Крупное расхождение — требуется утверждение руководителем'); // §5.6
    }

    const warehouseId = inv.warehouseId;
    return this.prisma.$transaction(async (tx) => {
      // Документ корректировки держит движения инвентаризации
      const corrCount = await tx.whDocument.count({ where: { type: 'CORRECTION' } });
      const corr = await tx.whDocument.create({
        data: {
          number: `КР-${String(corrCount + 1).padStart(5, '0')}`,
          type: 'CORRECTION',
          status: 'POSTED',
          fromWarehouseId: warehouseId,
          comment: `Инвентаризация ${inv.number}`,
          postedAt: new Date(),
          authorId: adminId,
          amount: totalMoney,
        },
      });

      for (const l of inv.lines) {
        if (l.factQuantity == null) continue;
        const batch = l.batch ?? '';
        const expiryKey = l.expiryKey ?? '';
        const bal = await tx.whBalance.findUnique({
          where: { warehouseId_itemId_batch_expiryKey: { warehouseId, itemId: l.itemId, batch, expiryKey } },
        });
        const currentQty = bal?.quantity ?? 0;
        const target = l.factQuantity;
        if (target === currentQty) continue;
        const applied = target - currentQty;
        if (bal) {
          await tx.whBalance.update({ where: { id: bal.id }, data: { quantity: target } });
        } else if (target > 0) {
          await tx.whBalance.create({ data: { warehouseId, itemId: l.itemId, batch, expiryKey, expiryDate: l.expiryDate, quantity: target, avgCost: l.price } });
        }
        await tx.whMovement.create({
          data: {
            documentId: corr.id, documentType: 'CORRECTION', itemId: l.itemId, warehouseId, addressId: wh.addressId,
            batch: l.batch || null, expiryDate: l.expiryDate, quantityIn: Math.max(applied, 0), quantityOut: Math.max(-applied, 0), price: l.price, amount: Math.abs(applied) * l.price, createdById: adminId,
          },
        });
      }

      const done = await tx.whInventory.update({ where: { id }, data: { status: 'POSTED', finishedAt: new Date() } });
      await this.audit.record(
        { actorId: adminId, action: 'posted', entity: 'WhInventory', entityId: id, payload: { number: inv.number, document: corr.number, discrepancy: totalMoney } },
        tx,
      );
      return done;
    });
  }

  async cancel(id: string, adminId: string) {
    const inv = await this.prisma.whInventory.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Инвентаризация не найдена');
    if (inv.status === 'POSTED') throw new BadRequestException('Проведённую инвентаризацию нельзя отменить');
    const updated = await this.prisma.whInventory.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.record({ actorId: adminId, action: 'cancelled', entity: 'WhInventory', entityId: id, payload: { number: inv.number } });
    return updated;
  }

  private async genNumber(): Promise<string> {
    const count = await this.prisma.whInventory.count();
    return `ИНВ-${String(count + 1).padStart(5, '0')}`;
  }
}
