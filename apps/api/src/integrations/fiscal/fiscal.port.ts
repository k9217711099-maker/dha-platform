import type { Receipt } from '../yookassa/yookassa.types.js';

/** Запрос на фискализацию чека (54-ФЗ) по проведённой оплате. */
export interface FiscalReceiptRequest {
  /** Наш идентификатор платежа (используется как external_id/идемпотентность). */
  paymentId: string;
  amountRub: number;
  /** Позиции и покупатель — та же модель, что и для эквайринга. */
  receipt: Receipt;
}

export interface FiscalResult {
  provider: string;
  /** registered — чек пробит; pending — принят, ждёт ОФД; skipped — фискализация выключена; failed — ошибка. */
  status: 'registered' | 'pending' | 'skipped' | 'failed';
  /** Идентификатор фискального документа/операции (если есть). */
  fiscalId?: string;
  error?: string;
}

/**
 * Порт фискализации чеков. Нужен, когда эквайер не бьёт чек сам (случай БСПБ).
 * Реализации выбираются по FISCAL_PROVIDER: NoFiscal (none), MockFiscal (mock),
 * AtolFiscal (atol — АТОЛ Онлайн). Бизнес-логика зависит только от порта.
 */
export abstract class FiscalPort {
  /** Включена ли фискализация через нашу систему. */
  abstract enabled(): boolean;
  /** Идентификатор активного провайдера (для журнала/статуса). */
  abstract provider(): string;
  /** Зарегистрировать чек прихода. Не должен ронять оплату при сбое. */
  abstract register(req: FiscalReceiptRequest): Promise<FiscalResult>;
}
