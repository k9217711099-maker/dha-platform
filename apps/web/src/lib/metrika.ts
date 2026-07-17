/**
 * Яндекс.Метрика: тонкая обёртка для отслеживания воронки бронирования.
 * Номер счётчика берётся из NEXT_PUBLIC_YANDEX_METRIKA_ID. Если он не задан —
 * все вызовы становятся no-op (удобно для dev/preview без счётчика).
 */

declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void;
  }
}

export const YM_ID = Number(process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID ?? '') || 0;

/** Цели воронки (§19 — этапы бронирования) + аналитика фильтров и шаринга. */
export type YmGoal =
  | 'search'
  | 'view_property'
  | 'view_room'
  | 'select_room'
  | 'booking_created'
  | 'checkout_payment'
  | 'payment_success'
  | 'register_click'
  // Аналитика фильтров: считаем, какими фильтрами пользуются.
  | 'filter_apply'
  | 'filter_reset'
  | 'filter_open'
  // Шаринг ссылки на выдачу.
  | 'share_link';

/** Достижение цели Метрики (reachGoal). */
export function ymGoal(target: YmGoal, params?: Record<string, unknown>): void {
  if (!YM_ID || typeof window === 'undefined' || !window.ym) return;
  window.ym(YM_ID, 'reachGoal', target, params);
}

/** SPA-переход (hit) при смене маршрута. */
export function ymHit(url: string): void {
  if (!YM_ID || typeof window === 'undefined' || !window.ym) return;
  window.ym(YM_ID, 'hit', url);
}
