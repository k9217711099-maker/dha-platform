/**
 * Виды тарифов (kind) — стабильная часть идентификатора тарифа.
 * ID тарифа из Bnovo имеет вид `<roomTypeId>-<kind>` (см. mock-bnovo.adapter).
 * Используются, чтобы отмечать доп-услуги как «включённые в тариф».
 */
export interface RatePlanKind {
  kind: string;
  label: string;
}

export const RATE_PLAN_KINDS: RatePlanKind[] = [
  { kind: 'standard', label: 'Стандарт (возвратный)' },
  { kind: 'nonref', label: 'Невозвратный тариф' },
];
