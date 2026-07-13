import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * Ключи идемпотентности (DHP ADR-003). Повторный запрос с тем же ключом в рамках
 * одной операции (endpoint) должен вернуть исходный результат. Запись ключа делается
 * в той же транзакции, что и создаваемая сущность; уникальный индекс ловит гонки.
 * Переиспользуется Channel Manager (ingestion OTA-броней, Sprint 6).
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  lookup(tenantId: string, endpoint: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: { tenantId_endpoint_key: { tenantId, endpoint, key } },
    });
  }
}
