'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Extra, type ExtraPeriod, type RatePlanKind, type RoomTypeAdmin } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

const UNITS: { value: string; label: string }[] = [
  { value: 'PER_STAY', label: 'за проживание' },
  { value: 'PER_NIGHT', label: 'за ночь' },
  { value: 'PER_PERSON', label: 'за гостя' },
  { value: 'PER_PERSON_NIGHT', label: 'за гостя/ночь' },
];
const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

interface FormState {
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  price: number;
  unit: string;
  maxQty: number;
  quantitySelectable: boolean;
  active: boolean;
  periods: ExtraPeriod[];
  roomTypeIds: string[];
  includedRatePlanKinds: string[];
}
const EMPTY: FormState = {
  name: '', description: '', category: '', imageUrl: '', price: 500, unit: 'PER_STAY',
  maxQty: 1, quantitySelectable: false, active: true, periods: [], roomTypeIds: [], includedRatePlanKinds: [],
};

export default function ExtrasPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<Extra[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeAdmin[]>([]);
  const [kinds, setKinds] = useState<RatePlanKind[]>([]);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => adminApi.extras().then(setItems).catch(() => undefined);
  useEffect(() => {
    if (ready) {
      void load();
      adminApi.roomTypes().then(setRoomTypes).catch(() => undefined);
      adminApi.ratePlanKinds().then(setKinds).catch(() => undefined);
    }
  }, [ready]);

  function startEdit(e: Extra) {
    setEditId(e.id);
    setForm({
      name: e.name, description: e.description ?? '', category: e.category ?? '', imageUrl: e.imageUrl ?? '',
      price: e.price, unit: e.unit, maxQty: e.maxQty, quantitySelectable: e.quantitySelectable, active: e.active,
      periods: e.periods ?? [], roomTypeIds: e.roomTypeIds ?? [], includedRatePlanKinds: e.includedRatePlanKinds ?? [],
    });
  }
  function reset() {
    setEditId(null);
    setForm({ ...EMPTY });
  }

  async function save() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        price: form.price,
        unit: form.unit,
        maxQty: form.maxQty,
        quantitySelectable: form.quantitySelectable,
        active: form.active,
        periods: form.periods.filter((p) => p.from && p.until),
        roomTypeIds: form.roomTypeIds,
        includedRatePlanKinds: form.includedRatePlanKinds,
      };
      if (editId) await adminApi.updateExtra(editId, body);
      else await adminApi.createExtra(body);
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function toggleRoom(id: string) {
    setForm((f) => ({ ...f, roomTypeIds: f.roomTypeIds.includes(id) ? f.roomTypeIds.filter((x) => x !== id) : [...f.roomTypeIds, id] }));
  }
  function toggleKind(kind: string) {
    setForm((f) => ({ ...f, includedRatePlanKinds: f.includedRatePlanKinds.includes(kind) ? f.includedRatePlanKinds.filter((x) => x !== kind) : [...f.includedRatePlanKinds, kind] }));
  }
  function addPeriod() {
    setForm((f) => ({ ...f, periods: [...f.periods, { from: '', until: '' }] }));
  }
  function setPeriod(i: number, patch: Partial<ExtraPeriod>) {
    setForm((f) => ({ ...f, periods: f.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  }
  function removePeriod(i: number) {
    setForm((f) => ({ ...f, periods: f.periods.filter((_, j) => j !== i) }));
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-2 text-3xl font-light text-ink">Дополнительные услуги</h1>
      <p className="mb-6 text-sm text-dark-gray">
        Конструктор апселлов (не зависит от Bnovo). Можно задать картинку, периоды действия и привязку к категориям номеров.
      </p>

      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">{editId ? 'Редактирование услуги' : 'Новая услуга'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="name" label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input id="cat" label="Категория (напр. Питание)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <Input id="desc" label="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Input id="img" label="Ссылка на картинку (URL)" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <Input id="price" label="Цена за единицу, ₽" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Единица расчёта</span>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </label>
          <Input id="max" label="Макс. кол-во (0 — без лимита)" type="number" min={0} value={form.maxQty} onChange={(e) => setForm({ ...form, maxQty: Number(e.target.value) })} />
        </div>

        {/* Периоды действия */}
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Периоды действия (пусто — всегда)</p>
          {form.periods.map((p, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input type="date" value={p.from} onChange={(e) => setPeriod(i, { from: e.target.value })} className="rounded-md border border-ink/20 px-2 py-1.5 text-sm" />
              <span className="text-dark-gray">—</span>
              <input type="date" value={p.until} onChange={(e) => setPeriod(i, { until: e.target.value })} className="rounded-md border border-ink/20 px-2 py-1.5 text-sm" />
              <button onClick={() => removePeriod(i)} className="text-sm text-dark-gray underline hover:text-red-700">убрать</button>
            </div>
          ))}
          <button onClick={addPeriod} className="text-sm text-primary underline">+ добавить период</button>
        </div>

        {/* Привязка к категориям */}
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Категории номеров (пусто — для всех)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {roomTypes.map((rt) => (
              <label key={rt.id} className="flex items-center gap-1.5 text-sm text-dark-gray">
                <input type="checkbox" checked={form.roomTypeIds.includes(rt.id)} onChange={() => toggleRoom(rt.id)} />
                <span>{rt.property.name} · {rt.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Включено в тариф (бесплатно) */}
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Включена бесплатно в тарифы (показывать как «включено»)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {kinds.map((k) => (
              <label key={k.kind} className="flex items-center gap-1.5 text-sm text-dark-gray">
                <input type="checkbox" checked={form.includedRatePlanKinds.includes(k.kind)} onChange={() => toggleKind(k.kind)} />
                <span>{k.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-dark-gray">
            <input type="checkbox" checked={form.quantitySelectable} onChange={(e) => setForm({ ...form, quantitySelectable: e.target.checked })} />
            <span>Можно выбирать количество</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-gray">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Активна (показывать гостям)</span>
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={busy}>{editId ? 'Сохранить' : 'Добавить'}</Button>
          {editId && <Button variant="secondary" onClick={reset}>Отмена</Button>}
        </div>
      </Card>

      <div className="space-y-2">
        {items.map((e) => (
          <Card key={e.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              {e.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.imageUrl} alt={e.name} className="h-10 w-10 rounded-md object-cover" />
              )}
              <div>
                <p className={e.active ? 'text-ink' : 'text-dark-gray line-through'}>
                  {e.name} · {e.price.toLocaleString('ru')} ₽ {unitLabel(e.unit)}
                </p>
                <p className="text-xs text-dark-gray">
                  {e.category ? `${e.category} · ` : ''}{e.quantitySelectable ? `выбор кол-ва (макс ${e.maxQty || '∞'})` : 'да/нет'}
                  {e.periods && e.periods.length > 0 ? ` · ${e.periods.length} период(ов)` : ''}
                  {e.roomTypeIds.length > 0 ? ` · ${e.roomTypeIds.length} категор.` : ' · все категории'}
                  {e.includedRatePlanKinds.length > 0 ? ` · включено в ${e.includedRatePlanKinds.length} тариф(а)` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => startEdit(e)}>Изменить</Button>
              <button onClick={() => { if (confirm(`Удалить «${e.name}»?`)) void adminApi.deleteExtra(e.id).then(load); }} className="text-sm text-dark-gray hover:text-red-700">Удалить</button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
