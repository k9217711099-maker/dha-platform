'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@dha/ui';
import { adminApi, type WhDashboard } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

const rub = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('ru')} ₽`);

function Stat({ title, value, accent }: { title: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-dark-gray">{title}</p>
      <p className={`mt-1 text-2xl font-light ${accent ? 'text-red-700' : 'text-ink'}`}>{value}</p>
    </Card>
  );
}

export default function WarehouseDashboardPage() {
  const ready = useRequireAdmin();
  const [d, setD] = useState<WhDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (ready) adminApi.whDashboard().then(setD).catch((e) => setErr(e.message));
  }, [ready]);

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Дашборд</h1>
      <p className="mb-6 text-sm text-dark-gray">Сводка по остаткам и движениям (§6.1)</p>
      {err && <p className="mb-4 text-sm text-red-700">{err}</p>}
      {!d ? (
        <p className="text-dark-gray">Загрузка…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Стоимость остатков" value={rub(d.totalStockValue)} />
            <Stat title="Позиций на складах" value={String(d.positionsCount)} />
            <Stat title="Ниже минимума" value={String(d.belowMinCount)} accent={d.belowMinCount > 0} />
            <Stat title="Истекает срок (30 дн)" value={String(d.expiringCount)} accent={d.expiringCount > 0} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-lg text-ink">Ниже минимума</h2>
              {d.lowStock.length === 0 ? (
                <p className="text-sm text-dark-gray">Нет позиций ниже минимума.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {d.lowStock.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-3">
                      <span className="truncate text-ink">{i.name}</span>
                      <span className="shrink-0 text-red-700">
                        {i.qty} / мин {i.minStock}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-lg text-ink">Последние движения</h2>
              {d.recentMovements.length === 0 ? (
                <p className="text-sm text-dark-gray">Движений пока нет.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {d.recentMovements.map((m) => (
                    <li key={m.id} className="flex justify-between gap-3">
                      <span className="truncate text-ink">{m.itemName}</span>
                      <span className="shrink-0 text-dark-gray">
                        {m.quantityIn > 0 ? `+${m.quantityIn}` : `−${m.quantityOut}`} {m.unit} · {m.warehouseName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 text-sm">
            <Link href="/warehouse/documents" className="text-primary underline">
              Документы →
            </Link>
            <span className="mx-3 text-dark-gray">·</span>
            <Link href="/warehouse/balances" className="text-primary underline">
              Остатки →
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
