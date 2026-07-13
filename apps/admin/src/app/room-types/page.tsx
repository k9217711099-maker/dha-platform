'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Amenity, type RoomTypeAdmin } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

interface Form {
  name: string;
  capacity: number;
  areaSqm: string;
  bedType: string;
  description: string;
  amenities: string[];
  photos: string;
  active: boolean;
}

function toForm(r: RoomTypeAdmin): Form {
  return {
    name: r.name,
    capacity: r.capacity,
    areaSqm: r.areaSqm != null ? String(r.areaSqm) : '',
    bedType: r.bedType ?? '',
    description: r.description ?? '',
    amenities: r.amenities,
    photos: r.photos.join('\n'),
    active: r.active,
  };
}

export default function RoomTypesPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<RoomTypeAdmin[]>([]);
  const [dict, setDict] = useState<Amenity[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => adminApi.roomTypes().then(setItems).catch(() => undefined);
  useEffect(() => {
    if (ready) {
      void load();
      adminApi.amenities().then((a) => setDict(a.filter((x) => x.active)));
    }
  }, [ready]);

  function startEdit(r: RoomTypeAdmin) {
    setEditing(r.id);
    setForm(toForm(r));
    setError(null);
  }

  async function save(id: string) {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateRoomType(id, {
        name: form.name.trim(),
        capacity: form.capacity,
        areaSqm: form.areaSqm ? Number(form.areaSqm) : undefined,
        bedType: form.bedType,
        description: form.description,
        amenities: form.amenities,
        photos: form.photos.split('\n').map((s) => s.trim()).filter(Boolean),
        active: form.active,
      });
      setEditing(null);
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function toggleAmenity(code: string) {
    setForm((f) => (f ? { ...f, amenities: f.amenities.includes(code) ? f.amenities.filter((c) => c !== code) : [...f.amenities, code] } : f));
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-2 text-3xl font-light text-ink">Карточки номеров</h1>
      <p className="mb-6 text-sm text-dark-gray">
        Контент категорий (фото, описание, удобства, площадь). Доступность и цены приходят из Bnovo и здесь не редактируются;
        контент карточек синхронизация не перезаписывает.
      </p>

      <div className="space-y-3">
        {items.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className={`text-lg ${r.active ? 'text-ink' : 'text-dark-gray line-through'}`}>{r.name}</h2>
                <p className="text-sm text-dark-gray">
                  {r.property.name} · до {r.capacity} гост.{r.areaSqm ? ` · ${r.areaSqm} м²` : ''} · фото: {r.photos.length} · удобств: {r.amenities.length}
                </p>
              </div>
              {editing !== r.id && (
                <Button variant="secondary" onClick={() => startEdit(r)}>Редактировать</Button>
              )}
            </div>

            {editing === r.id && form && (
              <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input id="name" label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input id="cap" label="Вместимость" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
                  <Input id="area" label="Площадь, м²" type="number" value={form.areaSqm} onChange={(e) => setForm({ ...form, areaSqm: e.target.value })} />
                  <Input id="bed" label="Кровать" value={form.bedType} onChange={(e) => setForm({ ...form, bedType: e.target.value })} />
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm text-dark-gray">Описание</span>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
                </label>

                <div>
                  <p className="mb-1.5 text-sm text-dark-gray">Удобства</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {dict.map((a) => (
                      <label key={a.id} className="flex items-center gap-1.5 text-sm text-dark-gray">
                        <input type="checkbox" checked={form.amenities.includes(a.code)} onChange={() => toggleAmenity(a.code)} />
                        <span>{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm text-dark-gray">Фото (по одной ссылке в строке)</span>
                  <textarea value={form.photos} onChange={(e) => setForm({ ...form, photos: e.target.value })} rows={4} className="w-full rounded-md border border-ink/20 px-3 py-2 font-mono text-xs" />
                </label>

                <label className="flex items-center gap-2 text-sm text-dark-gray">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  <span>Активна (показывать гостям)</span>
                </label>

                {error && <p className="text-sm text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <Button onClick={() => void save(r.id)} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button>
                  <Button variant="secondary" onClick={() => { setEditing(null); setForm(null); }}>Отмена</Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
