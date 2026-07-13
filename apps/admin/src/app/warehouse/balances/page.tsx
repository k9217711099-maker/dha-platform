'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type WhBalanceRow, type WhCategory, type WhWarehouse } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

export default function WarehouseBalancesPage() {
  const ready = useRequireAdmin();
  const [rows, setRows] = useState<WhBalanceRow[]>([]);
  const [warehouses, setWarehouses] = useState<WhWarehouse[]>([]);
  const [cats, setCats] = useState<WhCategory[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [belowMin, setBelowMin] = useState(false);
  const [zero, setZero] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .whBalances({ warehouseId: warehouseId || undefined, categoryId: categoryId || undefined, q: q || undefined, belowMin, zero })
      .then(setRows)
      .catch((e) => setErr(e.message));
  }, [warehouseId, categoryId, q, belowMin, zero]);

  useEffect(() => {
    if (ready) {
      adminApi.whWarehouses().then(setWarehouses).catch(() => undefined);
      adminApi.whCategories().then(setCats).catch(() => undefined);
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [ready, load]);

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;
  const showCosts = rows.some((r) => r.amount != null);

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Остатки</h1>
      <p className="mb-3 text-sm text-dark-gray">Остатки по складам и адресам (§6.3)</p>

      <div className="mb-5">
        <Button variant="secondary" onClick={() => void adminApi.whExportBalances()}>
          Экспорт в Excel
        </Button>
      </div>

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Склад</span>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Все склады</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Категория</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Все категории</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input id="q" label="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-dark-gray">
              <input type="checkbox" checked={belowMin} onChange={(e) => setBelowMin(e.target.checked)} />
              ниже мин
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-gray">
              <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} />
              с нулевыми
            </label>
          </div>
        </div>
      </Card>

      {err && <p className="mb-4 text-sm text-red-700">{err}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-dark-gray">
              <th className="px-4 py-3">Позиция</th>
              <th className="px-4 py-3">Склад</th>
              <th className="px-4 py-3 text-right">Кол-во</th>
              <th className="px-4 py-3">Срок</th>
              {showCosts && <th className="px-4 py-3 text-right">Сумма</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showCosts ? 5 : 4} className="px-4 py-6 text-center text-dark-gray">
                  Нет данных.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5">
                  <td className="px-4 py-2.5">
                    <span className={r.belowMin ? 'text-red-700' : 'text-ink'}>{r.itemName}</span>
                    {r.sku && <span className="ml-2 text-xs text-dark-gray">{r.sku}</span>}
                    {r.category && <div className="text-xs text-dark-gray">{r.category}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-dark-gray">
                    {r.warehouseName}
                    {r.addressName && <div className="text-xs">{r.addressName}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.quantity} {r.unit}
                    {r.belowMin && <span className="ml-1 text-xs text-red-700">⚠</span>}
                  </td>
                  <td className="px-4 py-2.5 text-dark-gray">{r.expiryDate ? r.expiryDate.slice(0, 10) : '—'}</td>
                  {showCosts && (
                    <td className="px-4 py-2.5 text-right">{r.amount != null ? `${r.amount.toLocaleString('ru')} ₽` : '—'}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
