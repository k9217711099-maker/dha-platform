'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type CheckinQueueItem } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

export default function CheckinsPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<CheckinQueueItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => adminApi.checkins('SUBMITTED').then(setItems).catch(() => undefined);
  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  async function act(bookingId: string, fn: () => Promise<unknown>) {
    setBusy(bookingId);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-6 text-3xl font-light text-ink">Регистрации на проверку</h1>
      {items.length === 0 && <p className="text-dark-gray">Очередь пуста.</p>}
      <div className="space-y-3">
        {items.map((c) => (
          <Card key={c.bookingId} className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-ink">{c.property}</p>
                {c.passportCheckStatus ? (
                  <span
                    title={c.passportCheckNote ?? undefined}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.passportCheckStatus === 'VALID'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.passportCheckStatus === 'INVALID'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {c.passportCheckStatus === 'VALID'
                      ? 'Паспорт: действителен'
                      : c.passportCheckStatus === 'INVALID'
                        ? 'Паспорт: недействителен'
                        : 'Паспорт: ручная проверка'}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-dark-gray">
                Гость {c.guestId.slice(0, 8)} · взрослых {c.adults} · сканов {c.documentsCount}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => void act(c.bookingId, () => adminApi.approveCheckin(c.bookingId))} disabled={busy === c.bookingId}>
                Подтвердить
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const reason = prompt('Причина возврата на исправление:') ?? '';
                  if (reason) void act(c.bookingId, () => adminApi.rejectCheckin(c.bookingId, reason, true));
                }}
                disabled={busy === c.bookingId}
              >
                Вернуть
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
