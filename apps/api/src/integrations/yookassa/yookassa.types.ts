/**
 * Типы платёжного шлюза (модель YooKassa). Включают данные фискального чека (54-ФЗ).
 */
import type { PaymentMethod } from '../../common/payments/payment-methods.js';

export type { PaymentMethod };

/** Позиция фискального чека (54-ФЗ). */
export interface ReceiptItem {
  description: string;
  quantity: number;
  amount: { value: string; currency: string };
  /** Код ставки НДС (1 — без НДС). */
  vatCode: number;
  /** Признак предмета расчёта (service — услуга). */
  paymentSubject: string;
  /** Признак способа расчёта (full_payment — полная оплата). */
  paymentMode: string;
}

/** Фискальный чек (54-ФЗ). */
export interface Receipt {
  customer: { email?: string; phone?: string };
  items: ReceiptItem[];
}

export interface CreatePaymentRequest {
  amountRub: number;
  currency: string;
  description: string;
  /** true — одностадийный платёж; false — холд с последующим capture (депозит). */
  capture: boolean;
  bookingId: string;
  returnUrl: string;
  receipt: Receipt;
  /** Ключ идемпотентности (защита от двойного списания). */
  idempotenceKey: string;
  /**
   * Разрешённые способы оплаты (Настройки → Финансы). Шлюз, поддерживающий
   * ограничение (БСПБ), покажет только их; напр. ['sbp'] — только СБП.
   * Если не задано — все доступные у эквайера способы.
   */
  allowedMethods?: PaymentMethod[];
}

export interface PaymentResult {
  gatewayPaymentId: string;
  /** pending | waiting_for_capture | succeeded | canceled */
  status: string;
  /** URL страницы оплаты (для redirect-сценария) или null. */
  confirmationUrl: string | null;
}

export interface RefundResult {
  refundId: string;
  status: string;
}

/** Разобранное событие webhook платёжного шлюза. */
export interface WebhookEvent {
  event: string;
  gatewayPaymentId: string;
  status: string;
}
