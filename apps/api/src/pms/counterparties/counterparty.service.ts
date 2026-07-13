import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import type { UpsertCounterpartyDto } from './dto/counterparty.dto.js';

/**
 * Контрагенты-покупатели (агентства и компании) — справочник для счетов/актов.
 * В отличие от LegalEntity (наши реквизиты) — это внешние покупатели.
 */
@Injectable()
export class CounterpartyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.counterparty.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' } });
  }

  listAll(tenantId: string) {
    return this.prisma.counterparty.findMany({ where: { tenantId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  }

  async create(tenantId: string, dto: UpsertCounterpartyDto, actorId?: string) {
    const c = await this.prisma.counterparty.create({ data: { ...dto, tenantId, name: dto.name.trim() } });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'Counterparty', entityId: c.id, payload: { name: c.name, kind: c.kind } });
    return c;
  }

  async update(tenantId: string, id: string, dto: UpsertCounterpartyDto, actorId?: string) {
    await this.get(tenantId, id);
    const c = await this.prisma.counterparty.update({ where: { id }, data: { ...dto } });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'Counterparty', entityId: id, payload: { name: c.name } });
    return c;
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    const c = await this.get(tenantId, id);
    await this.prisma.counterparty.delete({ where: { id } });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'Counterparty', entityId: id, payload: { name: c.name } });
    return { ok: true };
  }

  private async get(tenantId: string, id: string) {
    const c = await this.prisma.counterparty.findFirst({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Контрагент не найден');
    return c;
  }
}
