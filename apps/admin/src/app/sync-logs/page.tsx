'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type SyncLog } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

export default function SyncLogsPage() {
  const ready = useRequireAdmin();
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => adminApi.syncLogs().then(setLogs).catch(() => undefined);
  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  async function runSync() {
    setBusy(true);
    try {
      await adminApi.runSync();
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-light text-ink">Логи интеграций</h1>
        <Button onClick={() => void runSync()} disabled={busy}>
          {busy ? 'Синхронизация…' : 'Запустить синхронизацию Bnovo'}
        </Button>
      </div>
      <div className="space-y-2">
        {logs.length === 0 && <p className="text-dark-gray">Записей нет.</p>}
        {logs.map((l) => (
          <Card key={l.id} className="flex items-center justify-between">
            <div>
              <p className="text-ink">
                {l.integration} · {l.operation}
              </p>
              <p className="text-xs text-dark-gray">
                {new Date(l.startedAt).toLocaleString('ru')}
                {l.message ? ` · ${l.message}` : ''}
              </p>
            </div>
            <span
              className={`text-sm ${l.status === 'error' ? 'text-red-700' : 'text-ink'}`}
            >
              {l.status} · {l.itemsSynced}
            </span>
          </Card>
        ))}
      </div>
    </main>
  );
}
