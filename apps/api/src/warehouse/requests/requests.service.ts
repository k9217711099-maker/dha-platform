import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WhRequestStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateRequestDto } from '../dto/warehouse.dto.js';

/** Заявки адресов на пополнение запасов (§5.2, §6.5) + рекомендации по par stock (§5.7). */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Рекомендация к пополнению адреса: par stock − доступный остаток (§5.7). */
  async recommendations(addressId: string) {
    const whs = await this.prisma.whWarehouse.findMany({ where: { addressId } });
    const whIds = whs.map((w) => w.id);
    const [items, balances, parLevels] = await Promise.all([
      this.prisma.whItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      whIds.length ? this.prisma.whBalance.findMany({ where: { warehouseId: { in: whIds } } }) : Promise.resolve([]),
      this.prisma.whParLevel.findMany({ where: { addressId } }),
    ]);
    const avail = new Map<string, number>();
    for (const b of balances) avail.set(b.itemId, (avail.get(b.itemId) ?? 0) + b.quantity - b.reserved);
    const parByItem = new Map(parLevels.map((p) => [p.itemId, p.parStock ?? null]));

    return items
      .map((it) => {
        const par = (parByItem.get(it.id) ?? it.parStock) ?? 0;
        const available = avail.get(it.id) ?? 0;
        return { itemId: it.id, name: it.name, unit: it.unit, par, available, recommend: Math.max(0, par - available) };
      })
      .filter((r) => r.par > 0); // только позиции с заданным par stock
  }

  list(filter?: { status?: WhRequestStatus; addressId?: string }) {
    return this.prisma.whReplenishmentRequest.findMany({
      where: { status: filter?.status, addressId: filter?.addressId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
      take: 200,
    });
  }

  async get(id: string) {
    const req = await this.prisma.whReplenishmentRequest.findUnique({
      where: { id },
      include: { lines: { include: { item: { select: { id: true, name: true, unit: true } } } } },
    });
    if (!req) throw new NotFoundException('Заявка не найдена');
    return req;
  }

  async create(dto: CreateRequestDto, adminId: string) {
    const lines = dto.lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({ itemId: l.itemId, quantity: l.quantity, comment: l.comment ?? null }));
    if (!lines.length) throw new BadRequestException('Добавьте хотя бы одну позицию');

    const number = await this.genNumber();
    const req = await this.prisma.whReplenishmentRequest.create({
      data: {
        number,
        addressId: dto.addressId,
        subdivision: dto.subdivision ?? null,
        priority: dto.priority ?? 'NORMAL',
        desiredDate: dto.desiredDate ? new Date(dto.desiredDate) : null,
        comment: dto.comment ?? null,
        status: 'SUBMITTED',
        authorId: adminId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.record({ actorId: adminId, action: 'created', entity: 'WhReplenishmentRequest', entityId: req.id, payload: { number: req.number } });
    return req;
  }

  async approve(id: string, adminId: string) {
    const req = await this.prisma.whReplenishmentRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Заявка не найдена');
    if (req.status !== 'SUBMITTED') throw new BadRequestException('Согласовать можно только отправленную заявку');
    const updated = await this.prisma.whReplenishmentRequest.update({
      where: { id },
      data: { status: 'APPROVED', approverId: adminId, approvedAt: new Date() },
    });
    await this.audit.record({ actorId: adminId, action: 'approved', entity: 'WhReplenishmentRequest', entityId: id, payload: { number: req.number } });
    return updated;
  }

  async reject(id: string, reason: string | undefined, adminId: string) {
    const req = await this.prisma.whReplenishmentRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Заявка не найдена');
    if (req.status !== 'SUBMITTED') throw new BadRequestException('Отклонить можно только отправленную заявку');
    const updated = await this.prisma.whReplenishmentRequest.update({
      where: { id },
      data: { status: 'REJECTED', comment: reason ?? req.comment },
    });
    await this.audit.record({ actorId: adminId, action: 'rejected', entity: 'WhReplenishmentRequest', entityId: id, payload: { number: req.number, reason } });
    return updated;
  }

  /** Создать перемещение ЦС → локальный склад адреса на основании согласованной заявки (§5.2.8). */
  async createTransfer(id: string, adminId: string) {
    const req = await this.prisma.whReplenishmentRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!req) throw new NotFoundException('Заявка не найдена');
    if (req.status !== 'APPROVED') throw new BadRequestException('Сначала согласуйте заявку');
    if (!req.addressId) throw new BadRequestException('У заявки не указан адрес');

    const central = await this.prisma.whWarehouse.findFirst({ where: { type: 'CENTRAL' } });
    if (!central) throw new BadRequestException('Не найден центральный склад');
    const local = await this.prisma.whWarehouse.findFirst({ where: { addressId: req.addressId, type: 'ADDRESS_LOCAL' } });
    if (!local) throw new BadRequestException('У адреса нет локального склада');

    const count = await this.prisma.whDocument.count({ where: { type: 'TRANSFER' } });
    const number = `ПМ-${String(count + 1).padStart(5, '0')}`;

    const doc = await this.prisma.whDocument.create({
      data: {
        number,
        type: 'TRANSFER',
        status: 'DRAFT',
        fromWarehouseId: central.id,
        toWarehouseId: local.id,
        addressId: req.addressId,
        comment: `По заявке ${req.number}`,
        authorId: adminId,
        amount: 0,
        lines: { create: req.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, price: 0, amount: 0 })) },
      },
      include: { lines: true },
    });
    await this.prisma.whReplenishmentRequest.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    await this.audit.record({
      actorId: adminId,
      action: 'transfer_created',
      entity: 'WhReplenishmentRequest',
      entityId: id,
      payload: { number: req.number, document: doc.number },
    });
    return doc;
  }

  private async genNumber(): Promise<string> {
    const count = await this.prisma.whReplenishmentRequest.count();
    return `ЗП-${String(count + 1).padStart(5, '0')}`;
  }
}
