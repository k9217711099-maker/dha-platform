'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Amenity, type AmenityCategoryOption } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';
import { AmenityIcon, AMENITY_ICON_NAMES } from '../../components/AmenityIcon';

/** Пикер иконки Lucide из курируемого набора. */
function IconPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-10 w-10 items-center justify-center rounded-md border border-ink/20 bg-white text-ink hover:border-ink/40" title="Выбрать иконку">
        {value ? <AmenityIcon name={value} className="h-5 w-5" /> : <span className="text-lg text-ink/30">✦</span>}
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-ink/15 bg-white p-2 shadow-lg">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="mb-1 block w-full rounded px-2 py-1 text-left text-xs text-dark-gray hover:bg-ink/5">Без иконки</button>
          <div className="grid grid-cols-6 gap-1">
            {AMENITY_ICON_NAMES.map((name) => (
              <button key={name} type="button" title={name} onClick={() => { onChange(name); setOpen(false); }}
                className={`flex h-8 w-8 items-center justify-center rounded hover:bg-ink/10 ${value === name ? 'bg-emerald-100 text-emerald-700' : 'text-ink'}`}>
                <AmenityIcon name={name} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AmenitiesPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<Amenity[]>([]);
  const [cats, setCats] = useState<AmenityCategoryOption[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [isFilter, setIsFilter] = useState(false);
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
      await adminApi.createAmenity({ code: code.trim(), label: label.trim(), category, icon, isFilter });
      setCode('');
      setLabel('');
      setIcon(null);
      setIsFilter(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const patch = (a: Amenity, body: Parameters<typeof adminApi.updateAmenity>[1]) => {
    setError(null);
    void adminApi.updateAmenity(a.id, body).then(load).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const catLabel = (v: string) => cats.find((c) => c.value === v)?.label ?? v;
  const grouped = cats
    .map((c) => ({ cat: c, list: items.filter((i) => i.category === c.value) }))
    .filter((g) => g.list.length > 0);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-2 text-3xl font-light text-ink">Удобства и фильтры</h1>
      <p className="mb-6 text-sm text-dark-gray">
        Словарь удобств. Иконка показывается гостю в карточках и фильтрах. Отмеченные «Фильтр» выводятся как фильтр поиска
        в гостевом каталоге и модуле бронирования.
      </p>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="mb-1.5 block text-sm text-dark-gray">Иконка</span>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <Input id="code" label="Код (латиницей)" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
          <div className="min-w-[180px] flex-1"><Input id="label" label="Название" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Категория</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {cats.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-dark-gray"><input type="checkbox" checked={isFilter} onChange={(e) => setIsFilter(e.target.checked)} /> Фильтр</label>
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
                <Card key={a.id} className="flex items-center gap-3 py-2.5">
                  <IconPicker value={a.icon} onChange={(v) => patch(a, { icon: v })} />
                  <div className="min-w-0 flex-1">
                    <p className={a.active ? 'text-ink' : 'text-dark-gray line-through'}>{a.label}</p>
                    <p className="text-xs text-dark-gray">код: {a.code} · {catLabel(a.category)}</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-dark-gray" title="Показывать как фильтр поиска у гостя">
                    <input type="checkbox" checked={a.isFilter} onChange={(e) => patch(a, { isFilter: e.target.checked })} /> Фильтр
                  </label>
                  <Button variant="secondary" onClick={() => patch(a, { active: !a.active })}>
                    {a.active ? 'Скрыть' : 'Показать'}
                  </Button>
                  <button
                    onClick={() => {
                      if (confirm(`Удалить «${a.label}»?`)) void adminApi.deleteAmenity(a.id).then(load);
                    }}
                    className="shrink-0 text-sm text-dark-gray hover:text-red-700"
                  >
                    Удалить
                  </button>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
