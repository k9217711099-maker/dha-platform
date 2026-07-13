import type { Receipt } from '../integrations/yookassa/yookassa.types.js';

/**
 * Построить фискальный чек (54-ФЗ) для платежа за проживание.
 * Одна позиция-услуга на полную сумму, без НДС (vatCode=1). Чистая функция.
 */
export function buildReceipt(params: {
  description: string;
  amountRub: number;
  email?: string | null;
  phone?: string | null;
}): Receipt {
  return {
    customer: {
      email: params.email ?? undefined,
      phone: params.phone ?? undefined,
    },
    items: [
      {
        description: params.description.slice(0, 128),
        quantity: 1,
        amount: { value: params.amountRub.toFixed(2), currency: 'RUB' },
        vatCode: 1,
        paymentSubject: 'service',
        paymentMode: 'full_payment',
      },
    ],
  };
}
