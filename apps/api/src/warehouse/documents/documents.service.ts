import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WhDocStatus, WhDocType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateDocumentDto } from '../dto/warehouse.dto.js';
import { WRITE_OFF_APPROVAL_LIMIT } from '../constants.js';

const NUMBER_PREFIX: Record<WhDocType, string> = {
  RECEIPT: 'ПР',
  TRANSFER: 'ПМ',
  ISSUE: 'ВД',
  WRITE_OFF: 'СП',
  RETURN: 'ВЗ',
  INVENTORY: 'ИНВ',
  CORRECTION: 'КР',
  DEFECT: 'БР',
};

/** Документы движения товара (§4.7, §6.4). Изменение остатков — только через проведение. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(filter?: { type?: WhDocType; status?: WhDocStatus }) {
    return this.prisma.whDocument.findMany({
      where: { type: filter?.type, status: filter?.status },
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      take: 200,
    });
  }

  async get(id: string) {
    const doc = await this.prisma.whDocument.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        lines: { include: { item: { select: { id: true, name: true, unit: true, sku: true } } } },
      },
    });
    if (!doc) throw new NotFoundException('Документ не найден');
    return doc;
  }

  async create(dto: CreateDocumentDto, adminId: string) {
    if (dto.type === 'RECEIPT') return this.createReceipt(dto, adminId);
    if (dto.type === 'WRITE_OFF') return this.createWriteOff(dto, adminId);
    if (dto.type === 'RETURN') return this.createReturn(dto, adminId);
    throw new BadRequestException('Создание доступно для прихода, списания и возврата; перемещение формируется из заявки.');
  }

  // ─── Приход (§5.1) ───
  private async createReceipt(dto: CreateDocumentDto, adminId: string) {
    if (!dto.toWarehouseId) throw new BadRequestException('Для прихода нужен склад-получатель'); // §5.1
    const warehouse = await this.prisma.whWarehouse.findUnique({ where: { id: dto.toWarehouseId } });
    if (!warehouse) throw new BadRequestException('Склад-получатель не найден');

    const byId = await this.itemMap(dto);
    const lines = dto.lines.map((l) => {
      const item = byId.get(l.itemId);
      if (!item) throw new BadRequestException(`Позиция не найдена: ${l.itemId}`);
      if (l.quantity <= 0) throw new BadRequestException(`Нулевое количество недопустимо: ${item.name}`); // §5.1
      const expiryDate = l.expiryDate ? new Date(l.expiryDate) : null;
      if (item.trackExpiry && !expiryDate) throw new BadRequestException(`Укажите срок годности: ${item.name}`); // §5.1/§5.8
      if (item.trackBatches && !l.batch) throw new BadRequestException(`Укажите партию: ${item.name}`); // §5.1
      const price = l.price ?? 0;
      return { itemId: item.id, quantity: l.quantity, price, amount: l.quantity * price, batch: l.batch ?? null, expiryDate, unit: l.unit ?? item.unit, comment: l.comment ?? null };
    });
    const amount = lines.reduce((s, l) => s + l.amount, 0);
    const doc = await this.prisma.whDocument.create({
      data: {
        number: await this.genNumber('RECEIPT'),
        type: 'RECEIPT',
        status: 'DRAFT',
        docDate: dto.docDate ? new Date(dto.docDate) : undefined,
        supplierId: dto.supplierId ?? null,
        toWarehouseId: dto.toWarehouseId,
        externalRef: dto.externalRef ?? null,
        comment: dto.comment ?? null,
        amount,
        authorId: adminId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.record({ actorId: adminId, action: 'created', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, type: doc.type } });
    return doc;
  }

  // ─── Списание (§5.4): причина обязательна; крупные суммы → на согласование (§17.7) ───
  private async createWriteOff(dto: CreateDocumentDto, adminId: string) {
    if (!dto.fromWarehouseId) throw new BadRequestException('Для списания нужен склад');
    if (!dto.reason) throw new BadRequestException('Укажите причину списания'); // §5.4/§23.8
    const warehouse = await this.prisma.whWarehouse.findUnique({ where: { id: dto.fromWarehouseId } });
    if (!warehouse) throw new BadRequestException('Склад не найден');

    const byId = await this.itemMap(dto);
    const lines = dto.lines.map((l) => {
      const item = byId.get(l.itemId);
      if (!item) throw new BadRequestException(`Позиция не найдена: ${l.itemId}`);
      if (l.quantity <= 0) throw new BadRequestException(`Нулевое количество недопустимо: ${item.name}`);
      const price = item.avgPrice ?? 0; // оценка себестоимости для порога согласования
      return { itemId: item.id, quantity: l.quantity, price, amount: l.quantity * price, batch: l.batch ?? null, expiryDate: l.expiryDate ? new Date(l.expiryDate) : null, unit: l.unit ?? item.unit, comment: l.comment ?? null };
    });
    const amount = lines.reduce((s, l) => s + l.amount, 0);
    const status: WhDocStatus = amount > WRITE_OFF_APPROVAL_LIMIT ? 'PENDING_APPROVAL' : 'DRAFT';

    const doc = await this.prisma.whDocument.create({
      data: {
        number: await this.genNumber('WRITE_OFF'),
        type: 'WRITE_OFF',
        status,
        fromWarehouseId: dto.fromWarehouseId,
        reason: dto.reason,
        comment: dto.comment ?? null,
        amount,
        authorId: adminId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.record({ actorId: adminId, action: 'created', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, type: doc.type, reason: dto.reason, needsApproval: status === 'PENDING_APPROVAL' } });
    return doc;
  }

  // ─── Возврат с адреса (§5.5): причина обязательна; «брак» → склад брака ───
  private async createReturn(dto: CreateDocumentDto, adminId: string) {
    if (!dto.fromWarehouseId) throw new BadRequestException('Для возврата нужен склад-источник (адрес)');
    if (!dto.reason) throw new BadRequestException('Укажите причину возврата'); // §5.5
    const warehouse = await this.prisma.whWarehouse.findUnique({ where: { id: dto.fromWarehouseId } });
    if (!warehouse) throw new BadRequestException('Склад не найден');

    const byId = await this.itemMap(dto);
    const lines = dto.lines.map((l) => {
      const item = byId.get(l.itemId);
      if (!item) throw new BadRequestException(`Позиция не найдена: ${l.itemId}`);
      if (l.quantity <= 0) throw new BadRequestException(`Нулевое количество недопустимо: ${item.name}`);
      const price = item.avgPrice ?? 0;
      return { itemId: item.id, quantity: l.quantity, price, amount: l.quantity * price, batch: l.batch ?? null, expiryDate: l.expiryDate ? new Date(l.expiryDate) : null, unit: l.unit ?? item.unit, comment: l.comment ?? null };
    });
    const amount = lines.reduce((s, l) => s + l.amount, 0);

    const doc = await this.prisma.whDocument.create({
      data: {
        number: await this.genNumber('RETURN'),
        type: 'RETURN',
        status: 'DRAFT',
        fromWarehouseId: dto.fromWarehouseId,
        reason: dto.reason,
        comment: dto.comment ?? null,
        amount,
        authorId: adminId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.record({ actorId: adminId, action: 'created', entity: 'WhDocument', entityId: doc.id, payload: { number: doc.number, type: doc.type, reason: dto.reason } });
    return doc;
  }

  private async itemMap(dto: CreateDocumentDto) {
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await this.prisma.whItem.findMany({ where: { id: { in: itemIds } } });
    return new Map(items.map((i) => [i.id, i]));
  }

  private async genNumber(type: WhDocType): Promise<string> {
    const count = await this.prisma.whDocument.count({ where: { type } });
    return `${NUMBER_PREFIX[type]}-${String(count + 1).padStart(5, '0')}`;
  }
}
