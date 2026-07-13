'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Amenity, type AmenityCategoryOption } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

export default function AmenitiesPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<Amenity[]>([]);
  const [cats, setCats] = useState<AmenityCategoryOption[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => adminApi.amenities().then(setItems).catch(() => undefined);
  useEffect(() => {
    if (ready) {
      void load();
      adminApi.amenityCategories().then((c) => {
        setCats(c);
        if (c[0]) setCategory(c[0].value);
      });
    }
  }, [ready]);

  async function create() {
    if (!code.trim() || !label.trim() || !category) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.createAmenity({ code: code.trim(), label: label.trim(), category });
      setCode('');
      setLabel('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const catLabel = (v: string) => cats.find((c) => c.value === v)?.label ?? v;
  const grouped = cats
    .map((c) => ({ cat: c, list: items.filter((i) => i.category === c.value) }))
    .filter((g) => g.list.length > 0);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-2 text-3xl font-light text-ink">Удобства и фильтры</h1>
      <p className="mb-6 text-sm text-dark-gray">
        Словарь удобств. Активные пункты показываются в фильтрах поиска и доступны для выбора в карточках номеров.
      </p>

      <Card className="mb-6">
        <div className="grid items-end gap-3 sm:grid-cols-[140px_1fr_180px_120px]">
          <Input id="code" label="Код (латиницей)" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input id="label" label="Название" value={label} onChange={(e) => setLabel(e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Категория</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {cats.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <Button onClick={() => void create()} disabled={busy}>Добавить</Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      <div className="space-y-6">
        {grouped.map(({ cat, list }) => (
          <div key={cat.value}>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-dark-gray">{cat.label}</h2>
            <div className="space-y-2">
              {list.map((a) => (
                <Card key={a.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className={a.active ? 'text-ink' : 'text-dark-gray line-through'}>{a.label}</p>
                    <p className="text-xs text-dark-gray">код: {a.code} · {catLabel(a.category)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => void adminApi.updateAmenity(a.id, { active: !a.active }).then(load)}>
                      {a.active ? 'Скрыть' : 'Показать'}
                    </Button>
                    <button
                      onClick={() => {
                        if (confirm(`Удалить «${a.label}»?`)) void adminApi.deleteAmenity(a.id).then(load);
                      }}
                      className="text-sm text-dark-gray hover:text-red-700"
                    >
                      Удалить
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
