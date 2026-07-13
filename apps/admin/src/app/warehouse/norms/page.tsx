'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import {
  adminApi,
  type WhAddress,
  type WhItem,
  type WhMeta,
  type WhNorm,
  type WhOverspendRow,
} from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

export default function WarehouseNormsPage() {
  const ready = useRequireAdmin();
  const [norms, setNorms] = useState<WhNorm[]>([]);
  const [items, setItems] = useState<WhItem[]>([]);
  const [addresses, setAddresses] = useState<WhAddress[]>([]);
  const [meta, setMeta] = useState<WhMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // форма нормы
  const [itemId, setItemId] = useState('');
  const [normAddressId, setNormAddressId] = useState('');
  const [unit, setUnit] = useState('ROOM_NIGHT');
  const [normQuantity, setNormQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  // отчёт перерасхода
  const [repAddressId, setRepAddressId] = useState('');
  const [roomNights, setRoomNights] = useState(30);
  const [stays, setStays] = useState(10);
  const [guests, setGuests] = useState(20);
  const [cleanings, setCleanings] = useState(30);
  const [rows, setRows] = useState<WhOverspendRow[] | null>(null);

  const unitLabel = (v: string) => meta?.normUnits.find((o) => o.value === v)?.label ?? v;
  const addrName = (id: string | null) => addresses.find((a) => a.id === id)?.name ?? 'все адреса';

  const loadNorms = () => adminApi.whNorms().then(setNorms).catch((e) => setError(e.message));
  useEffect(() => {
    if (ready) {
      void loadNorms();
      adminApi.whItems().then(setItems).catch(() => undefined);
      adminApi.whAddresses().then(setAddresses).catch(() => undefined);
      adminApi.whMeta().then(setMeta).catch(() => undefined);
    }
  }, [ready]);

  async function addNorm() {
    if (!itemId) return setError('Выберите позицию');
    setBusy(true);
    setError(null);
    try {
      await adminApi.whCreateNorm({ itemId, addressId: normAddressId || undefined, unit, normQuantity });
      setItemId('');
      await loadNorms();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runReport() {
    setError(null);
    if (!repAddressId) return setError('Выберите адрес для отчёта');
    try {
      const r = await adminApi.whOverspend({ addressId: repAddressId, roomNights, stays, guests, cleanings });
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Нормы и перерасход</h1>
      <p className="mb-5 text-sm text-dark-gray">
        Нормы расхода (§7) и сравнение фактического расхода (списаний) с нормативным. База (номеро-сутки и т.п.) вводится вручную — позже из PMS (§8.3).
      </p>
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {/* Норма */}
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новая норма расхода</h2>
        <div className="grid items-end gap-3 sm:grid-cols-5">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm text-dark-gray">Позиция</span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— выберите —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Адрес</span>
            <select value={normAddressId} onChange={(e) => setNormAddressId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">Все адреса</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">На единицу</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {(meta?.normUnits ?? []).map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <Input id="qty" label="Норма" type="number" min={0} value={normQuantity} onChange={(e) => setNormQuantity(Number(e.target.value))} />
        </div>
        <Button onClick={() => void addNorm()} disabled={busy || !itemId}>
          Добавить норму
        </Button>
      </Card>

      <Card className="mb-8 p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-dark-gray">
              <th className="px-4 py-3">Позиция</th>
              <th className="px-4 py-3">Норма</th>
              <th className="px-4 py-3">Адрес</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {norms.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-dark-gray">
                  Норм пока нет.
                </td>
              </tr>
            ) : (
              norms.map((n) => (
                <tr key={n.id} className="border-b border-ink/5">
                  <td className="px-4 py-2.5 text-ink">{n.item.name}</td>
                  <td className="px-4 py-2.5 text-dark-gray">
                    {n.normQuantity} {n.item.unit} / {unitLabel(n.unit)}
                  </td>
                  <td className="px-4 py-2.5 text-dark-gray">{addrName(n.addressId)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => { if (confirm('Удалить норму?')) void adminApi.whDeleteNorm(n.id).then(loadNorms); }} className="text-sm text-dark-gray underline hover:text-red-700">
                      удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Отчёт перерасхода */}
      <h2 className="mb-2 text-xl font-light text-ink">Перерасход по адресу (§6.7.14)</h2>
      <Card className="mb-5 space-y-3">
        <div className="grid items-end gap-3 sm:grid-cols-5">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm text-dark-gray">Адрес</span>
            <select value={repAddressId} onChange={(e) => setRepAddressId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— выберите —</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <Input id="rn" label="Номеро-сутки" type="number" min={0} value={roomNights} onChange={(e) => setRoomNights(Number(e.target.value))} />
          <Input id="st" label="Заезды" type="number" min={0} value={stays} onChange={(e) => setStays(Number(e.target.value))} />
          <Input id="gu" label="Гости" type="number" min={0} value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-5">
          <Input id="cl" label="Уборки" type="number" min={0} value={cleanings} onChange={(e) => setCleanings(Number(e.target.value))} />
          <div className="flex items-end sm:col-span-2">
            <Button onClick={() => void runReport()} disabled={!repAddressId}>
              Показать перерасход
            </Button>
          </div>
        </div>
      </Card>

      {rows && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-dark-gray">
                <th className="px-4 py-3">Позиция</th>
                <th className="px-4 py-3 text-right">Норматив</th>
                <th className="px-4 py-3 text-right">Факт (списано)</th>
                <th className="px-4 py-3 text-right">Откл.</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-dark-gray">
                    Нет норм для этого адреса.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.itemId} className="border-b border-ink/5">
                    <td className="px-4 py-2.5 text-ink">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-dark-gray">
                      {r.normative} {r.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.actual} {r.unit}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${r.overspent ? 'text-red-700' : 'text-green-700'}`}>
                      {r.overspend > 0 ? `+${r.overspend}` : r.overspend}
                      {r.overspent && <span className="ml-1 text-xs">перерасход</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
