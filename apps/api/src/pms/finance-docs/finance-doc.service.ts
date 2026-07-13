import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DepositStatus, DepositType, FinanceDocStatus, FinanceDocType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import type { CreateDepositDto, CreateFinanceDocDto, ResolveDepositDto } from './dto/finance-doc.dto.js';

/**
 * Финансовые документы брони (вкладка «Счёт»): счета/квитанции/акты (FinanceDoc) и
 * залоги (Deposit). Привязаны к нашей брони, гостю и реквизитам (LegalEntity). Все мутации
 * пишут аудит (журнал изменений брони).
 */
@Injectable()
export class FinanceDocService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private num(prefix: string): string {
    return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  private async assertBooking(tenantId: string, bookingId: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { roomType: { select: { securityDeposit: true } }, property: { select: { securityDeposit: true } } },
    });
    if (!b) throw new NotFoundException('Бронь не найдена');
    return b;
  }

  // ─── Счета / квитанции / акты ───
  listDocs(tenantId: string, bookingId: string) {
    return this.prisma.financeDoc.findMany({ where: { tenantId, bookingId }, orderBy: { createdAt: 'desc' } });
  }

  async createDoc(tenantId: string, bookingId: string, dto: CreateFinanceDocDto, actorId?: string) {
    await this.assertBooking(tenantId, bookingId);
    if (!dto.lines?.length) throw new BadRequestException('Добавьте хотя бы одну позицию');
    const total = dto.lines.reduce((s, l) => s + Math.round(l.amount), 0);
    const vatTotal = dto.lines.reduce((s, l) => {
      const rate = l.vatRate ?? 0;
      return s + (rate > 0 ? Math.round((l.amount * rate) / (100 + rate)) : 0);
    }, 0);
    const prefix = dto.docType === 'ACT' ? 'ACT' : dto.docType === 'RECEIPT' ? 'RCP' : dto.docType === 'ONLINE' ? 'ONL' : 'INV';
    const doc = await this.prisma.financeDoc.create({
      data: {
        tenantId, bookingId,
        docType: dto.docType as FinanceDocType,
        number: this.num(prefix),
        docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
        buyerType: dto.buyerType ?? 'individual',
        buyerName: dto.buyerName ?? null,
        buyerLegalEntityId: dto.buyerLegalEntityId ?? null,
        ourLegalEntityId: dto.ourLegalEntityId ?? null,
        message: dto.message ?? null,
        lines: dto.lines as unknown as Prisma.InputJsonValue,
        total, vatTotal,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: FinanceDocStatus.ISSUED,
        createdById: actorId ?? null,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'doc_created', entity: 'Booking', entityId: bookingId, payload: { docType: dto.docType, number: doc.number, total } });
    return doc;
  }

  async cancelDoc(tenantId: string, id: string, actorId?: string) {
    const doc = await this.prisma.financeDoc.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException('Документ не найден');
    const upd = await this.prisma.financeDoc.update({ where: { id }, data: { status: FinanceDocStatus.CANCELLED } });
    await this.audit.record({ tenantId, actorId, action: 'doc_cancelled', entity: 'Booking', entityId: doc.bookingId, payload: { number: doc.number } });
    return upd;
  }

  // ─── Залоги ───
  async depositDefault(tenantId: string, bookingId: string): Promise<number> {
    const b = await this.assertBooking(tenantId, bookingId);
    return b.roomType.securityDeposit ?? b.property.securityDeposit ?? 0;
  }

  listDeposits(tenantId: string, bookingId: string) {
    return this.prisma.deposit.findMany({ where: { tenantId, bookingId }, orderBy: { createdAt: 'desc' } });
  }

  async createDeposit(tenantId: string, bookingId: string, dto: CreateDepositDto, actorId?: string) {
    await this.assertBooking(tenantId, bookingId);
    const amount = Math.round(dto.amount);
    if (amount <= 0) throw new BadRequestException('Сумма залога должна быть больше нуля');
    const dep = await this.prisma.deposit.create({
      data: {
        tenantId, bookingId,
        type: dto.type as DepositType,
        method: dto.type === 'MANUAL' ? (dto.method ?? 'cash') : null,
        amount,
        status: DepositStatus.HELD,
        note: dto.note ?? null,
        createdById: actorId ?? null,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'deposit_held', entity: 'Booking', entityId: bookingId, payload: { type: dto.type, amount } });
    return dep;
  }

  async resolveDeposit(tenantId: string, id: string, dto: ResolveDepositDto, actorId?: string) {
    const dep = await this.prisma.deposit.findFirst({ where: { id, tenantId } });
    if (!dep) throw new NotFoundException('Залог не найден');
    if (dep.status !== DepositStatus.HELD) throw new BadRequestException('Залог уже закрыт');
    let status: DepositStatus;
    let capturedAmount = 0;
    if (dto.action === 'release') status = DepositStatus.RELEASED;
    else if (dto.action === 'refund') status = DepositStatus.REFUNDED;
    else {
      status = DepositStatus.CAPTURED;
      capturedAmount = Math.min(dep.amount, Math.max(0, Math.round(dto.capturedAmount ?? dep.amount)));
    }
    const upd = await this.prisma.deposit.update({ where: { id }, data: { status, capturedAmount, resolvedAt: new Date() } });
    await this.audit.record({ tenantId, actorId, action: `deposit_${dto.action}`, entity: 'Booking', entityId: dep.bookingId, payload: { amount: dep.amount, capturedAmount } });
    return upd;
  }
}
