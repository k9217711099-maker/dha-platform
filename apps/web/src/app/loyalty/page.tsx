'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@dha/ui';
import { LOYALTY_TIERS } from '@dha/domain';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import type { LoyaltySummary, PointTxn } from '../../lib/api-types';

const accrualRate = new Map<string, number>(LOYALTY_TIERS.map((t) => [t.tier, t.accrualRate]));

function statusLabel(s: string): string {
  return (
    {
      PENDING: 'ожидает',
      AVAILABLE: 'доступно',
      SPENT: 'списано',
      EXPIRED: 'сгорело',
      CANCELLED: 'отменено',
      FROZEN: 'заморожено',
    }[s] ?? s
  );
}

function reasonLabel(r: string): string {
  if (r.startsWith('manual:')) return 'Ручная операция';
  return { accrual: 'Начисление за проживание', redemption: 'Списание при бронировании' }[r] ?? r;
}

function HistoryRow({ t }: { t: PointTxn }) {
  return (
    <div className="flex items-center justify-between border-t border-ink/10 py-2 text-sm">
      <div>
        <p className="text-ink">{reasonLabel(t.reason)}</p>
        <p className="text-xs text-dark-gray">
          {new Date(t.createdAt).toLocaleDateString('ru')} · {statusLabel(t.status)}
        </p>
      </div>
      <span className={t.amount >= 0 ? 'text-ink' : 'text-dark-gray'}>
        {t.amount >= 0 ? '+' : ''}
        {t.amount.toLocaleString('ru')}
      </span>
    </div>
  );
}

export default function LoyaltyPage() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const [s, setS] = useState<LoyaltySummary | null>(null);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.getLoyaltySummary().then(setS).catch(() => undefined);
  }, [guest]);

  if (loading || !guest || !s) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;
  }

  const rate = Math.round((accrualRate.get(s.tier) ?? 0) * 100);
  const progressPct = s.progress.next
    ? Math.min(100, Math.round((s.qualifyingAmountRub / (s.qualifyingAmountRub + s.progress.amountToNext)) * 100))
    : 100;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <div>
        <h1 className="text-3xl font-light text-ink">Программа лояльности</h1>
        <p className="mt-1 text-sm text-dark-gray">
          Уровень <span className="text-ink">{s.tier}</span> · начисление {rate}% баллами за прямые брони
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-dark-gray">Доступно баллов</p>
          <p className="text-3xl font-light text-ink">{s.availableBalance.toLocaleString('ru')}</p>
          {s.pendingBalance > 0 && (
            <p className="mt-1 text-xs text-dark-gray">
              + {s.pendingBalance.toLocaleString('ru')} ожидают начисления
            </p>
          )}
          {s.nearestExpiry && (
            <p className="mt-1 text-xs text-dark-gray">
              Ближайшее сгорание: {new Date(s.nearestExpiry).toLocaleDateString('ru')}
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm text-dark-gray">Уровень</p>
          <p className="text-3xl font-light text-ink">{s.tier}</p>
          {s.progress.next ? (
            <>
              <div className="mt-3 h-2 w-full rounded-full bg-beige">
                <div className="h-2 rounded-full bg-ink" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-dark-gray">
                До {s.progress.next}: ещё {s.progress.amountToNext.toLocaleString('ru')} ₽ или{' '}
                {s.progress.nightsToNext} ноч.
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-dark-gray">Максимальный уровень достигнут.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-lg text-ink">За последние 12 месяцев</h2>
        <p className="text-sm text-dark-gray">
          Прямые брони: {s.qualifyingAmountRub.toLocaleString('ru')} ₽ · {s.qualifyingNights} ноч.
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg text-ink">История операций</h2>
        {s.history.length === 0 ? (
          <p className="text-sm text-dark-gray">Операций пока нет.</p>
        ) : (
          s.history.map((t, i) => <HistoryRow key={i} t={t} />)
        )}
      </Card>
    </main>
  );
}
