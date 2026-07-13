'use client';

import { useEffect, useState } from 'react';
import { Card } from '@dha/ui';
import { adminApi, type AnalyticsMetrics } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-dark-gray">{label}</p>
      <p className="text-2xl font-light text-ink">{value}</p>
    </Card>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const rub = (v: number) => `${v.toLocaleString('ru')} ₽`;

export default function AnalyticsPage() {
  const ready = useRequireAdmin();
  const [m, setM] = useState<AnalyticsMetrics | null>(null);

  useEffect(() => {
    if (ready) adminApi.metrics().then(setM).catch(() => undefined);
  }, [ready]);

  if (!ready || !m) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-6 text-3xl font-light text-ink">Аналитика</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Установки" value={String(m.installs)} />
        <Metric label="Регистрации" value={String(m.registrations)} />
        <Metric label="Бронирования" value={String(m.bookings)} />
        <Metric label="Доля прямых" value={pct(m.directShare)} />
        <Metric label="Конверсия в бронь" value={pct(m.conversionRate)} />
        <Metric label="Повторные гости" value={pct(m.repeatRate)} />
        <Metric label="Средний чек" value={rub(m.averageCheckRub)} />
        <Metric label="Оплачено броней" value={String(m.paidBookings)} />
        <Metric label="Баллов начислено" value={String(m.pointsAccrued)} />
        <Metric label="Баллов списано" value={String(m.pointsSpent)} />
        <Metric label="Ошибки ключей" value={String(m.keyErrors)} />
        <Metric label="Ответ ресепшен, мин" value={String(m.chatResponseAvgMinutes)} />
      </div>
      <p className="mt-4 text-xs text-dark-gray">
        Заявки/апселлы/отзывы — метрики появятся с соответствующими модулями (v2).
      </p>
    </main>
  );
}
