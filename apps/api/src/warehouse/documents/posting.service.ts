import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WhDocument, WhDocumentLine } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { WRITE_OFF_APPROVAL_LIMIT } from '../constants.js';

/** ISO-ключ срока для @@unique остатка (NULL в Postgres неуникален, поэтому строка). */
const expiryKeyOf = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');

type DocWithLines = WhDocument & { lines: WhDocumentLine[] };
type Tx = Prisma.TransactionClient;

/**
 * Проведение, отгрузка, приём и отмена документов. Остаток меняется ТОЛЬКО здесь:
 * регистр движений (WhMovement) + агрегат остатков (WhBalance) в одной транзакции (§14).
 * Приход (RECEIPT) проводится сразу; перемещение (TRANSFER) — двухфазно:
 * отгрузка (в пути) → подтверждение получения с актом расхождения (§5.3).
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async post(documentId: string, adminId: string) {
    const doc = await this.prisma.whDocument.findUnique({ where: { id: documentId }, include: { lines: true } });
    if (!doc) throw new NotFoundException('Документ не найден');
    if (doc.status === 'POSTED') throw new BadRequestException('Документ уже проведён');
    if (doc.status === 'CANCELLED') throw new BadRequestException('Документ отменён');
    if (doc.type === 'RECEIPT') return this.postReceipt(doc, adminId);
    if (doc.type === 'WRITE_OFF') return this.postWriteOff(doc, adminId);
    if (doc.type === 'RETURN') return this.postReturn(doc, adminId);
    if (doc.type === 'TRANSFER') {
      throw new BadRequestException('Перемещение проводится через «Отгрузить» и «Подтвердить получение»');
    }
    throw new BadRequestException('Проведение этого типа документа будет в следующем блоке');
  }

  // ─── Приход (поставщик → склад) ───
  private async postReceipt(doc: DocWithLines, adminId: string) {
    if (!doc.toWarehouseId) throw new BadRequestException('Не указан склад-получатель');
    const warehouseId = doc.toWarehouseId;
    const warehouse = await this.prisma.whWarehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new BadRequestException('Склад-получатель не найден');

    return this.prisma.$transaction(async (tx) => {
      for (const line of doc.lines) {
        const batch = line.batch ?? '';
        const expiryKey = expiryKeyOf(line.expiryDate);
        const existing = await tx.whBalance.findUnique({
          where: { warehouseId_itemId_batch_expiryKey: { warehouseId, itemId: line.itemId, batch, expiryKey } },
        });
        if (existing) {
          const newQty = existing.quantity + line.quantity;
          const newAvg = newQty > 0 ? (existing.quantity * existing.avgCost + line.quantity * line.price) / newQty : line.price;
          await tx.whBalance.update({ where: { id: existing.id }, data: { quantity: newQty, avgCost: newAvg, expiryDate: line.expiryDate ?? existing.expiryDate } });
        } else {
          await tx.whBalance.create({ data: { warehouseId, itemId: line.itemId, batch, expiryKey, expiryDate: line.expiryDate, quantity: line.quantity, avgCost: line.price } });
        }
        await tx.whMovement.create({
          data: {
            documentId: doc.id, documentType: doc.type, itemId: line.itemId, warehouseId, addressId: warehouse.addressId,
            batch: line.batch, expiryDate: line.expiryDate, quantityIn: line.quantity, quantityOut: 0, price: line.price, amount: line.amount, createdById: adminId,
          },
        });
      }
      const itemIds = [...new Set(doc.lines.map((l) => l.itemId))];
      for (const itemId of itemIds) {
        const bals = await tx.whBalance.findMany({ where: { itemId } });
        const totQty = bals.reduce((s, b) => s + b.quantity, 0);
        const totAmt = bals.reduce((s, b) => s + b.quantity * b.avgCost, 0);
        const lastLine = [...doc.lines].reverse().find((l) => l.itemId === itemId)!;
        await tx.whItem.update({ where: { id: itemId }, data: { lastPurchasePrice: lastLine.price, avgPrice: totQty > 0 ? totAmt / totQty : lastLine.price } });
      }
      const posted = await tx.whDocument.update({ where: { id: doc.id }, data: { status: 'POSTED', postedAt: new Date() } });
      await this.audit.record(
        { actorId: adminId, action: 'posted', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, type: doc.type, amount: doc.amount } },
        tx,
      );
      return posted;
    });
  }

  // ─── Перемещение, фаза 1: отгрузка (§5.3) ───
  async ship(documentId: string, adminId: string) {
    const doc = await this.prisma.whDocument.findUnique({ where: { id: documentId }, include: { lines: true } });
    if (!doc) throw new NotFoundException('Документ не найден');
    if (doc.type !== 'TRANSFER') throw new BadRequestException('Отгрузка доступна только для перемещения');
    if (doc.status !== 'DRAFT') throw new BadRequestException('Отгрузить можно только черновик перемещения');
    if (!doc.fromWarehouseId) throw new BadRequestException('Не указан склад-отправитель');
    const fromWh = await this.prisma.whWarehouse.findUnique({ where: { id: doc.fromWarehouseId } });
    if (!fromWh) throw new BadRequestException('Склад-отправитель не найден');

    return this.prisma.$transaction(async (tx) => {
      for (const line of doc.lines) {
        const shipped = await this.consumeSource(tx, doc, fromWh, line, adminId);
        await tx.whDocumentLine.update({
          where: { id: line.id },
          data: { shippedQty: shipped.qty, shippedCost: shipped.cost, shippedBatch: shipped.batch, shippedExpiry: shipped.expiry },
        });
      }
      const shippedDoc = await tx.whDocument.update({ where: { id: doc.id }, data: { status: 'SHIPPED' } });
      await this.audit.record({ actorId: adminId, action: 'shipped', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number } }, tx);
      return shippedDoc;
    });
  }

  /** FEFO-списание позиции со склада-отправителя. Возвращает агрегат отгруженного. */
  private async consumeSource(
    tx: Tx,
    doc: DocWithLines,
    fromWh: { id: string; addressId: string | null },
    line: WhDocumentLine,
    adminId: string,
  ): Promise<{ qty: number; cost: number; batch: string; expiry: Date | null }> {
    const sources = await tx.whBalance.findMany({
      where: {
        warehouseId: fromWh.id,
        itemId: line.itemId,
        quantity: { gt: 0 },
        ...(line.batch ? { batch: line.batch } : {}),
        ...(line.expiryDate ? { expiryKey: expiryKeyOf(line.expiryDate) } : {}),
      },
      orderBy: [{ expiryDate: 'asc' }, { quantity: 'desc' }],
    });
    const totalAvail = sources.reduce((s, b) => s + b.quantity - b.reserved, 0);
    if (totalAvail < line.quantity) {
      throw new BadRequestException('Недостаточно остатка на складе для операции'); // §5.3/§5.4
    }

    let need = line.quantity;
    let amount = 0;
    const used: { batch: string; expiry: Date | null }[] = [];
    for (const src of sources) {
      if (need <= 0) break;
      const take = Math.min(need, src.quantity - src.reserved);
      if (take <= 0) continue;
      need -= take;
      amount += src.avgCost * take;
      used.push({ batch: src.batch, expiry: src.expiryDate });
      await tx.whBalance.update({ where: { id: src.id }, data: { quantity: src.quantity - take } });
      await tx.whMovement.create({
        data: {
          documentId: doc.id, documentType: doc.type, itemId: line.itemId, warehouseId: fromWh.id, addressId: fromWh.addressId,
          batch: src.batch || null, expiryDate: src.expiryDate, quantityIn: 0, quantityOut: take, price: src.avgCost, amount: src.avgCost * take, createdById: adminId,
        },
      });
    }
    const cost = line.quantity > 0 ? amount / line.quantity : 0;
    // Партию/срок сохраняем, если всё ушло из одной — иначе агрегируем (потеря партии — детализация в блоке FEFO).
    const uniform = used.length === 1 && used[0] ? used[0] : { batch: '', expiry: null };
    return { qty: line.quantity, cost, batch: uniform.batch, expiry: uniform.expiry };
  }

  // ─── Перемещение, фаза 2: подтверждение получения + акт расхождения (§5.3) ───
  async receive(documentId: string, received: { lineId: string; receivedQty: number }[], adminId: string) {
    const doc = await this.prisma.whDocument.findUnique({ where: { id: documentId }, include: { lines: true } });
    if (!doc) throw new NotFoundException('Документ не найден');
    if (doc.type !== 'TRANSFER') throw new BadRequestException('Подтверждение доступно только для перемещения');
    if (doc.status !== 'SHIPPED') throw new BadRequestException('Подтвердить можно только отгруженное перемещение «в пути»');
    if (!doc.toWarehouseId) throw new BadRequestException('Не указан склад-получатель');
    const toWh = await this.prisma.whWarehouse.findUnique({ where: { id: doc.toWarehouseId } });
    if (!toWh) throw new BadRequestException('Склад-получатель не найден');
    const byLine = new Map(received.map((r) => [r.lineId, r.receivedQty]));

    return this.prisma.$transaction(async (tx) => {
      let hasDiscrepancy = false;
      for (const line of doc.lines) {
        const shippedQty = line.shippedQty ?? line.quantity;
        const raw = byLine.has(line.id) ? byLine.get(line.id)! : shippedQty;
        const recvQty = Math.max(0, Math.min(raw, shippedQty)); // получено не больше отгруженного
        const cost = line.shippedCost ?? line.price;
        const batch = line.shippedBatch ?? '';
        const expiry = line.shippedExpiry ?? null;
        const expiryKey = expiryKeyOf(expiry);

        if (recvQty > 0) {
          const dest = await tx.whBalance.findUnique({
            where: { warehouseId_itemId_batch_expiryKey: { warehouseId: toWh.id, itemId: line.itemId, batch, expiryKey } },
          });
          if (dest) {
            const newQty = dest.quantity + recvQty;
            const newAvg = newQty > 0 ? (dest.quantity * dest.avgCost + recvQty * cost) / newQty : cost;
            await tx.whBalance.update({ where: { id: dest.id }, data: { quantity: newQty, avgCost: newAvg, expiryDate: expiry ?? dest.expiryDate } });
          } else {
            await tx.whBalance.create({ data: { warehouseId: toWh.id, itemId: line.itemId, batch, expiryKey, expiryDate: expiry, quantity: recvQty, avgCost: cost } });
          }
          await tx.whMovement.create({
            data: {
              documentId: doc.id, documentType: doc.type, itemId: line.itemId, warehouseId: toWh.id, addressId: toWh.addressId,
              batch: batch || null, expiryDate: expiry, quantityIn: recvQty, quantityOut: 0, price: cost, amount: cost * recvQty, createdById: adminId,
            },
          });
        }

        await tx.whDocumentLine.update({ where: { id: line.id }, data: { receivedQty: recvQty } });

        const shortage = shippedQty - recvQty;
        if (shortage > 0) {
          hasDiscrepancy = true;
          // Акт расхождения: недостача в пути фиксируется в журнале (§5.3).
          await this.audit.record(
            { actorId: adminId, action: 'discrepancy', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, itemId: line.itemId, shipped: shippedQty, received: recvQty, shortage } },
            tx,
          );
        }
      }
      const result = await tx.whDocument.update({ where: { id: doc.id }, data: { status: 'POSTED', postedAt: new Date(), discrepancy: hasDiscrepancy } });
      await this.audit.record({ actorId: adminId, action: 'received', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, discrepancy: hasDiscrepancy } }, tx);
      return result;
    });
  }

  // ─── Списание (§5.4): FEFO-выбытие со склада + причина; крупные суммы → согласование (§17.7) ───
  private async postWriteOff(doc: DocWithLines, adminId: string) {
    if (!doc.fromWarehouseId) throw new BadRequestException('Не указан склад списания');
    if (!doc.reason) throw new BadRequestException('Укажите причину списания'); // §5.4/§23.8
    if (doc.amount > WRITE_OFF_APPROVAL_LIMIT && doc.status !== 'APPROVED') {
      throw new BadRequestException(
        `Списание на ${doc.amount.toLocaleString('ru')} ₽ превышает лимит ${WRITE_OFF_APPROVAL_LIMIT.toLocaleString('ru')} ₽ — требуется согласование`,
      );
    }
    const wh = await this.prisma.whWarehouse.findUnique({ where: { id: doc.fromWarehouseId } });
    if (!wh) throw new BadRequestException('Склад не найден');

    return this.prisma.$transaction(async (tx) => {
      let total = 0;
      for (const line of doc.lines) {
        const consumed = await this.consumeSource(tx, doc, wh, line, adminId);
        total += consumed.cost * consumed.qty;
      }
      const posted = await tx.whDocument.update({ where: { id: doc.id }, data: { status: 'POSTED', postedAt: new Date(), amount: total } });
      await this.audit.record(
        { actorId: adminId, action: 'posted', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, type: 'WRITE_OFF', reason: doc.reason, amount: total } },
        tx,
      );
      return posted;
    });
  }

  // ─── Возврат с адреса (§5.5): выбытие со склада адреса → зачисление на ЦС; «брак» → склад брака ───
  private async postReturn(doc: DocWithLines, adminId: string) {
    if (!doc.fromWarehouseId) throw new BadRequestException('Не указан склад-источник возврата');
    if (!doc.reason) throw new BadRequestException('Укажите причину возврата'); // §5.5
    const fromWh = await this.prisma.whWarehouse.findUnique({ where: { id: doc.fromWarehouseId } });
    if (!fromWh) throw new BadRequestException('Склад-источник не найден');
    // Повреждённое (причина «брак») — на склад брака, годное — на центральный склад (§5.5).
    const destType = doc.reason === 'DEFECT' ? 'DEFECT' : 'CENTRAL';
    const destWh = await this.prisma.whWarehouse.findFirst({ where: { type: destType } });
    if (!destWh) throw new BadRequestException(destType === 'DEFECT' ? 'Не найден склад брака' : 'Не найден центральный склад');

    return this.prisma.$transaction(async (tx) => {
      for (const line of doc.lines) {
        const consumed = await this.consumeSource(tx, doc, fromWh, line, adminId); // выбытие с адреса (FEFO)
        await this.creditWarehouse(tx, doc, destWh, line.itemId, consumed.qty, consumed.cost, consumed.batch, consumed.expiry, adminId);
      }
      const posted = await tx.whDocument.update({ where: { id: doc.id }, data: { status: 'POSTED', postedAt: new Date() } });
      await this.audit.record(
        { actorId: adminId, action: 'posted', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, type: 'RETURN', reason: doc.reason, destination: destType } },
        tx,
      );
      return posted;
    });
  }

  /** Зачисление количества на склад (upsert остатка + движение IN). Средневзвешенная себестоимость. */
  private async creditWarehouse(
    tx: Tx,
    doc: DocWithLines,
    wh: { id: string; addressId: string | null },
    itemId: string,
    qty: number,
    cost: number,
    batch: string,
    expiry: Date | null,
    adminId: string,
  ): Promise<void> {
    if (qty <= 0) return;
    const expiryKey = expiryKeyOf(expiry);
    const dest = await tx.whBalance.findUnique({
      where: { warehouseId_itemId_batch_expiryKey: { warehouseId: wh.id, itemId, batch, expiryKey } },
    });
    if (dest) {
      const newQty = dest.quantity + qty;
      const newAvg = newQty > 0 ? (dest.quantity * dest.avgCost + qty * cost) / newQty : cost;
      await tx.whBalance.update({ where: { id: dest.id }, data: { quantity: newQty, avgCost: newAvg, expiryDate: expiry ?? dest.expiryDate } });
    } else {
      await tx.whBalance.create({ data: { warehouseId: wh.id, itemId, batch, expiryKey, expiryDate: expiry, quantity: qty, avgCost: cost } });
    }
    await tx.whMovement.create({
      data: {
        documentId: doc.id, documentType: doc.type, itemId, warehouseId: wh.id, addressId: wh.addressId,
        batch: batch || null, expiryDate: expiry, quantityIn: qty, quantityOut: 0, price: cost, amount: cost * qty, createdById: adminId,
      },
    });
  }

  /** Согласование крупного списания (§17.7). Право wh_approve_writeoff. */
  async approve(documentId: string, adminId: string) {
    const doc = await this.prisma.whDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Документ не найден');
    if (doc.type !== 'WRITE_OFF') throw new BadRequestException('Согласование доступно только для списания');
    if (doc.status !== 'PENDING_APPROVAL' && doc.status !== 'DRAFT') {
      throw new BadRequestException('Согласовать можно только черновик или документ на согласовании');
    }
    const updated = await this.prisma.whDocument.update({ where: { id: documentId }, data: { status: 'APPROVED' } });
    await this.audit.record({ actorId: adminId, action: 'approved', entity: 'WhDocument', entityId: documentId, payload: { number: doc.number } });
    return updated;
  }

  /** Отмена: черновик → CANCELLED; «в пути»/проведённый — реверс движений и остатков (§11.6, без физического удаления). */
  async cancel(documentId: string, adminId: string) {
    const doc = await this.prisma.whDocument.findUnique({ where: { id: documentId }, include: { movements: true } });
    if (!doc) throw new NotFoundException('Документ не найден');
    if (doc.status === 'CANCELLED') return doc;

    const noMovements = doc.status === 'DRAFT' || doc.movements.length === 0;
    if (noMovements) {
      const cancelled = await this.prisma.whDocument.update({ where: { id: doc.id }, data: { status: 'CANCELLED' } });
      await this.audit.record({ actorId: adminId, action: 'cancelled', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number } });
      return cancelled;
    }

    return this.prisma.$transaction(async (tx) => {
      for (const m of doc.movements) {
        const batch = m.batch ?? '';
        const expiryKey = expiryKeyOf(m.expiryDate);
        const existing = await tx.whBalance.findUnique({
          where: { warehouseId_itemId_batch_expiryKey: { warehouseId: m.warehouseId, itemId: m.itemId, batch, expiryKey } },
        });
        if (existing) {
          // Реверс: убираем приход (quantityIn), возвращаем выбытие (quantityOut)
          const newQty = Math.max(0, existing.quantity - m.quantityIn + m.quantityOut);
          await tx.whBalance.update({ where: { id: existing.id }, data: { quantity: newQty } });
        }
      }
      const cancelled = await tx.whDocument.update({ where: { id: doc.id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        { actorId: adminId, action: 'cancelled', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, reversed: true } },
        tx,
      );
      return cancelled;
    });
  }
}
