'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Promocode } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

export default function PromocodesPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<Promocode[]>([]);
  const [code, setCode] = useState('');
  const [type, setType] = useState('PERCENT');
  const [value, setValue] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = () => adminApi.promocodes().then(setItems).catch(() => undefined);
  useEffect(() => {
    if (ready) void load();
  }, [ready]);

  async function create() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await adminApi.createPromocode({ code: code.trim(), type, value });
      setCode('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-6 text-3xl font-light text-ink">Промокоды</h1>

      <Card className="mb-6">
        <div className="grid items-end gap-3 sm:grid-cols-4">
          <Input id="code" label="Код" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Тип</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="PERCENT">Процент</option>
              <option value="FIXED">Сумма ₽</option>
            </select>
          </label>
          <Input id="value" label="Значение" type="number" min={1} value={value} onChange={(e) => setValue(Number(e.target.value))} />
          <Button onClick={() => void create()} disabled={busy}>
            Создать
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {items.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <p className="text-ink">
                {p.code} · {p.type === 'PERCENT' ? `${p.value}%` : `${p.value} ₽`}
              </p>
              <p className="text-xs text-dark-gray">
                использований: {p.usedCount}
                {p.maxUses ? ` / ${p.maxUses}` : ''}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void adminApi.togglePromocode(p.id, !p.active).then(load)}
            >
              {p.active ? 'Выключить' : 'Включить'}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
