import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FiscalPort } from './fiscal.port.js';
import type { FiscalReceiptRequest, FiscalResult } from './fiscal.port.js';

/**
 * Эмуляция фискализации (FISCAL_PROVIDER=mock). Реального чека нет: пишем позиции
 * в лог и возвращаем сгенерированный фискальный номер. Для разработки/демо БСПБ.
 */
@Injectable()
export class MockFiscalAdapter extends FiscalPort {
  private readonly logger = new Logger(MockFiscalAdapter.name);

  enabled(): boolean {
    return true;
  }
  provider(): string {
    return 'mock';
  }
  async register(req: FiscalReceiptRequest): Promise<FiscalResult> {
    const fiscalId = `mock-fd-${randomUUID().slice(0, 8)}`;
    this.logger.log(
      `Чек (mock) по платежу ${req.paymentId}: ${req.amountRub} ₽, позиций ${req.receipt.items.length} → ФД ${fiscalId}`,
    );
    return { provider: 'mock', status: 'registered', fiscalId };
  }
}
