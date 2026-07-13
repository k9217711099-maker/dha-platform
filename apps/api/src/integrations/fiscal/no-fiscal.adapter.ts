import { Injectable } from '@nestjs/common';
import { FiscalPort } from './fiscal.port.js';
import type { FiscalReceiptRequest, FiscalResult } from './fiscal.port.js';

/**
 * Фискализация выключена (FISCAL_PROVIDER=none). Используется, когда чек в ОФД
 * пробивает сам эквайер (напр. ЮKassa) либо фискализация ведётся вне системы.
 */
@Injectable()
export class NoFiscalAdapter extends FiscalPort {
  enabled(): boolean {
    return false;
  }
  provider(): string {
    return 'none';
  }
  async register(_req: FiscalReceiptRequest): Promise<FiscalResult> {
    return { provider: 'none', status: 'skipped' };
  }
}
