import type { Scenario } from '../scenarios.js';

/**
 * Метаданные сценариев уведомлений для UI (CHECK-IN-TZ §5.2): подпись,
 * доступные переменные и пример payload для предпросмотра.
 */
export const SCENARIO_META: Record<Scenario, { label: string; vars: string[]; sample: Record<string, string | number> }> = {
  BOOKING_CONFIRMED: { label: 'Бронирование подтверждено', vars: ['property', 'checkIn', 'checkOut'], sample: { property: 'Апартаменты на Рубинштейна', checkIn: '01.08', checkOut: '05.08' } },
  PAYMENT_RECEIPT: { label: 'Чек об оплате', vars: ['property', 'amount'], sample: { property: 'Апартаменты на Рубинштейна', amount: 12500 } },
  PAYMENT_REMINDER: { label: 'Напоминание об оплате', vars: ['property', 'link'], sample: { property: 'Апартаменты на Рубинштейна', link: 'https://dha.example/s/checkin/…' } },
  CHECKIN_APPROVED: { label: 'Регистрация подтверждена', vars: ['property'], sample: { property: 'Апартаменты на Рубинштейна' } },
  CHECKIN_INVITE: { label: 'Приглашение к онлайн-заселению', vars: ['property', 'link'], sample: { property: 'Апартаменты на Рубинштейна', link: 'https://dha.example/s/checkin/…' } },
  CHECKIN_REMINDER: { label: 'Напоминание о подготовке к заезду', vars: ['property', 'pending', 'link'], sample: { property: 'Апартаменты на Рубинштейна', pending: 'заполните данные гостей', link: 'https://dha.example/s/checkin/…' } },
  CHECKOUT_INFO: { label: 'Выезд оформлен', vars: ['property'], sample: { property: 'Апартаменты на Рубинштейна' } },
  KEY_READY: { label: 'Цифровой ключ готов', vars: ['property'], sample: { property: 'Апартаменты на Рубинштейна' } },
  POINTS_ACCRUED: { label: 'Начислены баллы', vars: ['points'], sample: { points: 500 } },
  CHAT_REPLY: { label: 'Ответ ресепшен в чате', vars: [], sample: {} },
  PERSONAL_OFFER: { label: 'Персональное предложение', vars: ['text'], sample: { text: 'Скидка 10% на следующий заезд' } },
  REVIEW_REQUEST: { label: 'Просьба об отзыве', vars: ['property'], sample: { property: 'Апартаменты на Рубинштейна' } },
};
