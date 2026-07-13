'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import {
  adminApi,
  type InventoryFactInput,
  type WhCategory,
  type WhInventoryDetail,
  type WhInventoryRow,
  type WhWarehouse,
} from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const STATUS: Record<string, string> = {
  DRAFT: 'Черновик',
  PENDING_APPROVAL: 'На согласовании',
  POSTED: 'Проведена',
  CANCELLED: 'Отменена',
};
const statusColor: Record<string, string> = {
  PENDING_APPROVAL: 'text-amber-700',
  POSTED: 'text-green-700',
  CANCELLED: 'text-red-700',
};

interface Draft {
  fact: number;
  reason: string;
}

export default function WarehouseInventoryPage() {
  const ready = useRequireAdmin();
  const [list, setList] = useState<WhInventoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<WhWarehouse[]>([]);
  const [cats, setCats] = useState<WhCategory[]>([]);
  const [detail, setDetail] = useState<WhInventoryDetail | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = () => adminApi.whInventories().then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    if (ready) {
      void loadList();
      adminApi.whWarehouses().then(setWarehouses).catch(() => undefined);
      adminApi.whCategories().then(setCats).catch(() => undefined);
    }
  }, [ready]);

  function openDetail(d: WhInventoryDetail) {
    setDetail(d);
    setDraft(Object.fromEntries(d.lines.map((l) => [l.id, { fact: l.factQuantity ?? l.bookQuantity, reason: l.reason ?? '' }])));
  }
  const reload = async (id: string) => openDetail(await adminApi.whInventory(id));

  async function start() {
    setError(null);
    setNotice(null);
    if (!warehouseId) return setError('Выберите склад');
    setBusy(true);
    try {
      const inv = await adminApi.whStartInventory({ warehouseId, categoryId: categoryId || undefined });
      setNotice(`Инвентаризация ${inv.number} начата — введите фактические остатки`);
      await loadList();
      openDetail(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function saveFacts() {
    if (!detail) return;
    setError(null);
    try {
      const lines: InventoryFactInput[] = detail.lines.map((l) => ({
        lineId: l.id,
        factQuantity: draft[l.id]?.fact ?? l.bookQuantity,
        reason: draft[l.id]?.reason || undefined,
      }));
      await adminApi.whUpdateInventoryFacts(detail.id, lines);
      setNotice('Факт сохранён');
      await reload(detail.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function action(fn: (id: string) => Promise<unknown>, id: string, ok: string) {
    setError(null);
    setNotice(null);
    try {
      await fn(id);
      setNotice(ok);
      await loadList();
      await reload(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? '—';
  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Инвентаризация</h1>
      <p className="mb-5 text-sm text-dark-gray">
        Снимок учётного остатка → ввод факта → расхождения (штуки и деньги) → утверждение → корректировки остатков (§5.6).
      </p>
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-700">{notice}</p>}

      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новая инвентаризация</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Склад</span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— выберите —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Категория (необязательно)</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">Все категории</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button onClick={() => void start()} disabled={busy || !warehouseId}>
              Начать
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-dark-gray">
                <th className="px-4 py-3">Документ</th>
                <th className="px-4 py-3">Склад</th>
                <th className="px-4 py-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-dark-gray">
                    Инвентаризаций пока нет.
                  </td>
                </tr>
              ) : (
                list.map((inv) => (
                  <tr key={inv.id} className="border-b border-ink/5">
                    <td className="px-4 py-2.5">
                      <button onClick={() => void reload(inv.id)} className="text-primary underline">
                        {inv.number}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-dark-gray">{whName(inv.warehouseId)}</td>
                    <td className={`px-4 py-2.5 ${statusColor[inv.status] ?? 'text-dark-gray'}`}>{STATUS[inv.status] ?? inv.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {detail && (
          <Card>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg text-ink">{detail.number}</h2>
                <p className="text-sm text-dark-gray">
                  {whName(detail.warehouseId)} · {STATUS[detail.status] ?? detail.status} · расхождение {detail.discrepancyMoney.toLocaleString('ru')} ₽
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-sm text-dark-gray hover:text-ink">
                закрыть
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-dark-gray">
                    <th className="py-2">Позиция</th>
                    <th className="py-2 text-right">Учёт</th>
                    <th className="py-2 text-right">Факт</th>
                    <th className="py-2 text-right">Откл.</th>
                    <th className="py-2">Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => {
                    const editable = detail.status === 'DRAFT';
                    const fact = draft[l.id]?.fact ?? l.bookQuantity;
                    const dev = fact - l.bookQuantity;
                    return (
                      <tr key={l.id} className="border-b border-ink/5">
                        <td className="py-2 text-ink">
                          {l.item.name} <span className="text-xs text-dark-gray">{l.item.unit}</span>
                        </td>
                        <td className="py-2 text-right text-dark-gray">{l.bookQuantity}</td>
                        <td className="py-2 text-right">
                          {editable ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={fact}
                              onChange={(e) => setDraft((d) => ({ ...d, [l.id]: { fact: Number(e.target.value), reason: d[l.id]?.reason ?? '' } }))}
                              className="w-20 rounded-md border border-ink/20 px-2 py-1 text-right text-sm"
                            />
                          ) : (
                            (l.factQuantity ?? '—')
                          )}
                        </td>
                        <td className={`py-2 text-right ${dev < 0 ? 'text-red-700' : dev > 0 ? 'text-green-700' : 'text-dark-gray'}`}>
                          {dev > 0 ? `+${dev}` : dev}
                        </td>
                        <td className="py-2">
                          {editable ? (
                            dev < 0 ? (
                              <input
                                value={draft[l.id]?.reason ?? ''}
                                onChange={(e) => setDraft((d) => ({ ...d, [l.id]: { fact: d[l.id]?.fact ?? l.bookQuantity, reason: e.target.value } }))}
                                placeholder="причина недостачи"
                                className="w-full rounded-md border border-ink/20 px-2 py-1 text-sm"
                              />
                            ) : (
                              <span className="text-xs text-dark-gray">—</span>
                            )
                          ) : (
                            <span className="text-xs text-dark-gray">{l.reason ?? '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {detail.status === 'DRAFT' && (
                <>
                  <Button variant="secondary" onClick={() => void saveFacts()}>
                    Сохранить факт
                  </Button>
                  <Button onClick={() => void action(adminApi.whSubmitInventory, detail.id, 'Отправлено на согласование')}>
                    На согласование
                  </Button>
                </>
              )}
              {detail.status === 'PENDING_APPROVAL' && (
                <Button onClick={() => void action(adminApi.whApproveInventory, detail.id, 'Утверждено — остатки скорректированы')}>
                  Утвердить и скорректировать
                </Button>
              )}
              {detail.status !== 'POSTED' && detail.status !== 'CANCELLED' && (
                <button
                  onClick={() => void action(adminApi.whCancelInventory, detail.id, 'Инвентаризация отменена')}
                  className="text-sm text-dark-gray underline hover:text-red-700"
                >
                  отменить
                </button>
              )}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
