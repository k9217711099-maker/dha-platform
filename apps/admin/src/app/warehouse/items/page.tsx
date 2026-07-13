'use client';

import { type ChangeEvent, useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type WhCategory, type WhItem } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

interface Form {
  name: string;
  sku: string;
  unit: string;
  categoryId: string;
  minStock: number;
  parStock: number;
  trackExpiry: boolean;
  trackBatches: boolean;
  active: boolean;
}
const EMPTY: Form = { name: '', sku: '', unit: 'шт', categoryId: '', minStock: 0, parStock: 0, trackExpiry: false, trackBatches: false, active: true };

export default function WarehouseItemsPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<WhItem[]>([]);
  const [cats, setCats] = useState<WhCategory[]>([]);
  const [form, setForm] = useState<Form>({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportMsg(null);
    try {
      const r = await adminApi.whImportItems(file);
      setImportMsg(`Импорт: создано ${r.created}, обновлено ${r.updated}, пропущено ${r.skipped}${r.errors.length ? `, ошибок ${r.errors.length}` : ''}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта');
    } finally {
      e.target.value = '';
    }
  }

  const load = () => adminApi.whItems({ q: q || undefined }).then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    if (ready) {
      adminApi.whCategories().then(setCats).catch(() => undefined);
    }
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [ready, q]);

  function startEdit(it: WhItem) {
    setEditId(it.id);
    setForm({
      name: it.name,
      sku: it.sku ?? '',
      unit: it.unit,
      categoryId: it.categoryId ?? '',
      minStock: it.minStock ?? 0,
      parStock: it.parStock ?? 0,
      trackExpiry: it.trackExpiry,
      trackBatches: it.trackBatches,
      active: it.active,
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
        sku: form.sku.trim() || undefined,
        unit: form.unit.trim() || 'шт',
        categoryId: form.categoryId || undefined,
        minStock: form.minStock || undefined,
        parStock: form.parStock || undefined,
        trackExpiry: form.trackExpiry,
        trackBatches: form.trackBatches,
        active: form.active,
      };
      if (editId) await adminApi.whUpdateItem(editId, body);
      else await adminApi.whCreateItem(body);
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Номенклатура</h1>
      <p className="mb-3 text-sm text-dark-gray">Справочник позиций (§4.4): единицы, категории, нормы, учёт сроков/партий.</p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void adminApi.whExportItems()}>
          Экспорт в Excel
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-ink/20 px-4 py-2 text-sm text-ink transition hover:bg-ink/5">
          Импорт из Excel
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onImport} />
        </label>
        {importMsg && <span className="text-sm text-green-700">{importMsg}</span>}
      </div>

      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">{editId ? 'Редактирование позиции' : 'Новая позиция'}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input id="name" label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input id="sku" label="Артикул" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input id="unit" label="Единица" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Категория</span>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">— без категории —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input id="min" label="Мин. остаток" type="number" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
          <Input id="par" label="Par stock" type="number" min={0} value={form.parStock} onChange={(e) => setForm({ ...form, parStock: Number(e.target.value) })} />
        </div>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-dark-gray">
            <input type="checkbox" checked={form.trackExpiry} onChange={(e) => setForm({ ...form, trackExpiry: e.target.checked })} />
            учёт срока годности
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-gray">
            <input type="checkbox" checked={form.trackBatches} onChange={(e) => setForm({ ...form, trackBatches: e.target.checked })} />
            учёт по партиям
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-gray">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            активна
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={busy}>
            {editId ? 'Сохранить' : 'Добавить'}
          </Button>
          {editId && (
            <Button variant="secondary" onClick={reset}>
              Отмена
            </Button>
          )}
        </div>
      </Card>

      <div className="mb-3 max-w-xs">
        <Input id="search" label="Поиск по названию/артикулу" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-dark-gray">
              <th className="px-4 py-3">Позиция</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3 text-right">Мин / Par</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-ink/5">
                <td className="px-4 py-2.5">
                  <span className={it.active ? 'text-ink' : 'text-dark-gray line-through'}>{it.name}</span>
                  <span className="ml-2 text-xs text-dark-gray">{it.unit}</span>
                  {(it.trackExpiry || it.trackBatches) && (
                    <span className="ml-2 text-xs text-dark-gray">{[it.trackExpiry ? 'срок' : '', it.trackBatches ? 'партии' : ''].filter(Boolean).join(', ')}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-dark-gray">{it.category?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-dark-gray">
                  {it.minStock ?? '—'} / {it.parStock ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => startEdit(it)} className="text-sm text-primary underline">
                    изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
