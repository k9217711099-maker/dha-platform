import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** Клиент БД или транзакция — чтобы писать аудит внутри $transaction. */
type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  /** Арендатор (мультиарендность). Опционально — для системных записей. */
  tenantId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  /** posted | cancelled | created | updated | deleted | corrected | status_changed | ... */
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

/** Журнал критичных действий (§11.5, §20.16). Переиспользуется во всех мутациях склада. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? null,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        payload: (entry.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  list(filter?: { entity?: string; entityId?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: { entity: filter?.entity, entityId: filter?.entityId },
      orderBy: { at: 'desc' },
      take: filter?.take ?? 100,
    });
  }
}
