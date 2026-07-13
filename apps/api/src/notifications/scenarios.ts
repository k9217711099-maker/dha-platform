import { NotificationChannel } from '@dha/domain';

/** Сценарии уведомлений (§16). */
export type Scenario =
  | 'BOOKING_CONFIRMED'
  | 'PAYMENT_RECEIPT'
  | 'PAYMENT_REMINDER'
  | 'CHECKIN_APPROVED'
  | 'CHECKIN_INVITE'
  | 'CHECKIN_REMINDER'
  | 'CHECKOUT_INFO'
  | 'KEY_READY'
  | 'POINTS_ACCRUED'
  | 'CHAT_REPLY'
  | 'PERSONAL_OFFER'
  | 'REVIEW_REQUEST';

export type NotificationPayload = Record<string, string | number>;

interface ScenarioDef {
  channels: NotificationChannel[];
  /** Маркетинговый сценарий — отправляется только при согласии на маркетинг. */
  marketing?: boolean;
  render(p: NotificationPayload): { title: string; body: string };
}

/** Реестр сценариев: каналы и тексты (§16.1–16.3). */
export const SCENARIOS: Record<Scenario, ScenarioDef> = {
  BOOKING_CONFIRMED: {
    channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Бронирование подтверждено',
      body: `${p.property}: ${p.checkIn} — ${p.checkOut}.`,
    }),
  },
  PAYMENT_RECEIPT: {
    channels: [NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Чек об оплате',
      body: `Оплата ${p.amount} ₽ за ${p.property} принята. Чек отправлен по 54-ФЗ.`,
    }),
  },
  PAYMENT_REMINDER: {
    channels: [NotificationChannel.PUSH],
    render: (p) => ({
      title: 'Напоминание об оплате',
      body: `Бронирование ${p.property} ожидает оплаты.`,
    }),
  },
  CHECKIN_APPROVED: {
    channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Онлайн-регистрация подтверждена',
      body: `Регистрация для ${p.property} подтверждена. Цифровой ключ будет доступен к заезду.`,
    }),
  },
  // Воронка заселения (CHECK-IN-TZ §5.2)
  CHECKIN_INVITE: {
    channels: [NotificationChannel.PUSH, NotificationChannel.SMS, NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Онлайн-заселение открыто',
      body: `${p.property}: пройдите онлайн-регистрацию заранее — заезд займёт меньше минуты.${p.link ? ` Ссылка: ${p.link}` : ''}`,
    }),
  },
  CHECKIN_REMINDER: {
    channels: [NotificationChannel.PUSH, NotificationChannel.SMS, NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Завершите подготовку к заезду',
      body: `${p.property}: ${p.pending ?? 'заполните данные и оплатите проживание'} — и ключ будет ждать вас.${p.link ? ` Ссылка: ${p.link}` : ''}`,
    }),
  },
  CHECKOUT_INFO: {
    channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Спасибо за проживание',
      body: `${p.property}: выезд оформлен, цифровой доступ отключён. Будем рады видеть вас снова.`,
    }),
  },
  KEY_READY: {
    channels: [NotificationChannel.PUSH],
    render: (p) => ({
      title: 'Цифровой ключ готов',
      body:
        `Ключ для ${p.property} доступен в приложении.` +
        (p.address ? ` Адрес: ${p.address}.` : '') +
        (p.instructions ? ` ${p.instructions}` : ''),
    }),
  },
  POINTS_ACCRUED: {
    channels: [NotificationChannel.PUSH],
    render: (p) => ({
      title: 'Начислены баллы',
      body: `За проживание начислено ${p.points} баллов D.`,
    }),
  },
  CHAT_REPLY: {
    channels: [NotificationChannel.PUSH],
    render: () => ({
      title: 'Сообщение от ресепшен',
      body: 'Администратор ответил в чате.',
    }),
  },
  PERSONAL_OFFER: {
    channels: [NotificationChannel.PUSH, NotificationChannel.EMAIL],
    marketing: true,
    render: (p) => ({ title: 'Персональное предложение', body: String(p.text) }),
  },
  REVIEW_REQUEST: {
    channels: [NotificationChannel.EMAIL],
    render: (p) => ({
      title: 'Поделитесь впечатлениями',
      body: `Как прошло проживание в ${p.property}? Будем рады отзыву.`,
    }),
  },
};
