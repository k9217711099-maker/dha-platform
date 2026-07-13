'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import {
  adminApi,
  type ReceiptLineInput,
  type WhDocumentDetail,
  type WhDocumentRow,
  type WhItem,
  type WhMeta,
  type WhSupplier,
  type WhWarehouse,
} from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';

interface LineForm {
  itemId: string;
  quantity: number;
  price: number;
  batch: string;
  expiryDate: string;
}
const emptyLine = (): LineForm => ({ itemId: '', quantity: 1, price: 0, batch: '', expiryDate: '' });
const emptyWoLine = (): LineForm => ({ itemId: '', quantity: 1, price: 0, batch: '', expiryDate: '' });

const statusColor: Record<string, string> = {
  DRAFT: 'text-dark-gray',
  PENDING_APPROVAL: 'text-amber-700',
  APPROVED: 'text-ink',
  SHIPPED: 'text-amber-700',
  POSTED: 'text-green-700',
  CANCELLED: 'text-red-700',
};

export default function WarehouseDocumentsPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const canApprove = me?.permissions.includes('wh_approve_writeoff') ?? false;
  const [docs, setDocs] = useState<WhDocumentRow[]>([]);
  const [items, setItems] = useState<WhItem[]>([]);
  const [warehouses, setWarehouses] = useState<WhWarehouse[]>([]);
  const [suppliers, setSuppliers] = useState<WhSupplier[]>([]);
  const [meta, setMeta] = useState<WhMeta | null>(null);
  const [detail, setDetail] = useState<WhDocumentDetail | null>(null);
  const [recvQty, setRecvQty] = useState<Record<string, number>>({});

  const [toWarehouseId, setToWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Форма списания (§5.4)
  const [woWarehouseId, setWoWarehouseId] = useState('');
  const [woReason, setWoReason] = useState('USED');
  const [woLines, setWoLines] = useState<LineForm[]>([emptyWoLine()]);

  // Форма возврата (§5.5)
  const [retWarehouseId, setRetWarehouseId] = useState('');
  const [retReason, setRetReason] = useState('OTHER');
  const [retLines, setRetLines] = useState<LineForm[]>([emptyWoLine()]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const typeLabel = (v: string) => meta?.docTypes.find((o) => o.value === v)?.label ?? v;
  const statusLabel = (v: string) => meta?.docStatuses.find((o) => o.value === v)?.label ?? v;

  const loadDocs = () => adminApi.whDocuments().then(setDocs).catch((e) => setError(e.message));

  useEffect(() => {
    if (!ready) return;
    void loadDocs();
    adminApi.whItems().then(setItems).catch(() => undefined);
    adminApi.whSuppliers().then(setSuppliers).catch(() => undefined);
    adminApi.whMeta().then(setMeta).catch(() => undefined);
    adminApi
      .whWarehouses()
      .then((w) => {
        setWarehouses(w);
        const central = w.find((x) => x.type === 'CENTRAL');
        if (central) setToWarehouseId(central.id);
      })
      .catch(() => undefined);
  }, [ready]);

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    if (!toWarehouseId) return setError('Выберите склад-получатель');
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) return setError('Добавьте хотя бы одну позицию с количеством');
    setBusy(true);
    try {
      const payloadLines: ReceiptLineInput[] = valid.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        price: l.price || 0,
        batch: l.batch || undefined,
        expiryDate: l.expiryDate || undefined,
      }));
      await adminApi.whCreateReceipt({
        toWarehouseId,
        supplierId: supplierId || undefined,
        externalRef: externalRef || undefined,
        lines: payloadLines,
      });
      setLines([emptyLine()]);
      setExternalRef('');
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    const d = await adminApi.whDocument(id);
    setDetail(d);
    if (d.type === 'TRANSFER' && d.status === 'SHIPPED') {
      setRecvQty(Object.fromEntries(d.lines.map((l) => [l.id, l.shippedQty ?? l.quantity])));
    }
  }

  async function post(id: string) {
    setError(null);
    try {
      await adminApi.whPostDocument(id);
      await loadDocs();
      if (detail?.id === id) await openDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  async function ship(id: string) {
    setError(null);
    setNotice(null);
    try {
      await adminApi.whShipDocument(id);
      setNotice('Перемещение отгружено — статус «в пути». Подтвердите получение на адресе.');
      await loadDocs();
      await openDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  async function receiveDoc(id: string) {
    setError(null);
    setNotice(null);
    try {
      const lines = Object.entries(recvQty).map(([lineId, q]) => ({ lineId, receivedQty: q }));
      const res = await adminApi.whReceiveDocument(id, lines);
      setNotice(res.discrepancy ? 'Получено с недостачей — зафиксирован акт расхождения.' : 'Перемещение получено полностью.');
      await loadDocs();
      await openDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  async function cancel(id: string) {
    if (!confirm('Отменить документ? Для проведённого будет выполнен реверс остатков.')) return;
    setError(null);
    try {
      await adminApi.whCancelDocument(id);
      await loadDocs();
      if (detail?.id === id) setDetail(await adminApi.whDocument(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  function setWoLine(i: number, patch: Partial<LineForm>) {
    setWoLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submitWriteOff() {
    setError(null);
    setNotice(null);
    if (!woWarehouseId) return setError('Выберите склад списания');
    const valid = woLines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) return setError('Добавьте позиции списания');
    setBusy(true);
    try {
      const doc = await adminApi.whCreateWriteOff({
        fromWarehouseId: woWarehouseId,
        reason: woReason,
        lines: valid.map((l) => ({ itemId: l.itemId, quantity: l.quantity, batch: l.batch || undefined, expiryDate: l.expiryDate || undefined })),
      });
      setWoLines([emptyWoLine()]);
      setNotice(
        doc.status === 'PENDING_APPROVAL'
          ? `Списание ${doc.number} создано — сумма выше лимита, требуется согласование`
          : `Списание ${doc.number} создано (черновик) — проведите его`,
      );
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setError(null);
    try {
      await adminApi.whApproveDocument(id);
      setNotice('Списание согласовано — можно проводить.');
      await loadDocs();
      if (detail?.id === id) await openDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  function setRetLine(i: number, patch: Partial<LineForm>) {
    setRetLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submitReturn() {
    setError(null);
    setNotice(null);
    if (!retWarehouseId) return setError('Выберите склад (адрес), с которого возврат');
    const valid = retLines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) return setError('Добавьте позиции возврата');
    setBusy(true);
    try {
      const doc = await adminApi.whCreateReturn({
        fromWarehouseId: retWarehouseId,
        reason: retReason,
        lines: valid.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      });
      setRetLines([emptyWoLine()]);
      setNotice(`Возврат ${doc.number} создан (черновик) — примите его для зачисления.`);
      await loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const total = lines.reduce((s, l) => s + (l.quantity || 0) * (l.price || 0), 0);
  const reasonLabel = (v: string) => meta?.writeOffReasons.find((o) => o.value === v)?.label ?? v;

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Документы</h1>
      <p className="mb-5 text-sm text-dark-gray">Приход на склад (§5.1). Остаток меняется только проведением документа.</p>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-700">{notice}</p>}

      {/* Форма прихода */}
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новый приход</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Склад-получатель</span>
            <select
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">— выберите —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Поставщик</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">— не указан —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Input id="ext" label="Накладная / счёт / УПД" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => {
            const it = itemById.get(l.itemId);
            return (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
                <label className="block sm:col-span-4">
                  <span className="mb-1 block text-xs text-dark-gray">Позиция</span>
                  <select
                    value={l.itemId}
                    onChange={(e) => setLine(i, { itemId: e.target.value })}
                    className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— выберите —</option>
                    {items.map((it2) => (
                      <option key={it2.id} value={it2.id}>
                        {it2.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-dark-gray">Кол-во{it ? `, ${it.unit}` : ''}</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                    className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-dark-gray">Цена, ₽</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={l.price}
                    onChange={(e) => setLine(i, { price: Number(e.target.value) })}
                    className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-dark-gray">Срок{it?.trackExpiry ? ' *' : ''}</span>
                  <input
                    type="date"
                    value={l.expiryDate}
                    onChange={(e) => setLine(i, { expiryDate: e.target.value })}
                    className="w-full rounded-md border border-ink/20 px-2 py-2 text-sm"
                  />
                </label>
                <div className="sm:col-span-2">
                  {lines.length > 1 && (
                    <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-sm text-dark-gray underline hover:text-red-700">
                      убрать
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={() => setLines((ls) => [...ls, emptyLine()])} className="text-sm text-primary underline">
            + позиция
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-ink/10 pt-3">
          <span className="text-sm text-dark-gray">
            Итого: <span className="text-ink">{total.toLocaleString('ru')} ₽</span>
          </span>
          <Button onClick={() => void submit()} disabled={busy}>
            Создать приход (черновик)
          </Button>
        </div>
      </Card>

      {/* Форма списания */}
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новое списание</h2>
        <p className="text-xs text-dark-gray">
          Причина обязательна (§5.4). Сумма выше {meta?.writeOffApprovalLimit?.toLocaleString('ru') ?? '—'} ₽ требует согласования руководителем (§17.7).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Склад списания</span>
            <select value={woWarehouseId} onChange={(e) => setWoWarehouseId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— выберите —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Причина списания</span>
            <select value={woReason} onChange={(e) => setWoReason(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {(meta?.writeOffReasons ?? []).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          {woLines.map((l, i) => {
            const it = itemById.get(l.itemId);
            return (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
                <label className="block sm:col-span-6">
                  <span className="mb-1 block text-xs text-dark-gray">Позиция</span>
                  <select value={l.itemId} onChange={(e) => setWoLine(i, { itemId: e.target.value })} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                    <option value="">— выберите —</option>
                    {items.map((it2) => (
                      <option key={it2.id} value={it2.id}>
                        {it2.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-3">
                  <span className="mb-1 block text-xs text-dark-gray">Кол-во{it ? `, ${it.unit}` : ''}</span>
                  <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setWoLine(i, { quantity: Number(e.target.value) })} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
                </label>
                <div className="sm:col-span-3">
                  {woLines.length > 1 && (
                    <button onClick={() => setWoLines((ls) => ls.filter((_, j) => j !== i))} className="text-sm text-dark-gray underline hover:text-red-700">
                      убрать
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={() => setWoLines((ls) => [...ls, emptyWoLine()])} className="text-sm text-primary underline">
            + позиция
          </button>
        </div>
        <Button onClick={() => void submitWriteOff()} disabled={busy || !woWarehouseId}>
          Создать списание
        </Button>
      </Card>

      {/* Форма возврата */}
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новый возврат с адреса</h2>
        <p className="text-xs text-dark-gray">
          Возврат со склада адреса. Годное зачисляется на центральный склад, причина «Брак» — на склад брака (§5.5).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Склад (адрес) возврата</span>
            <select value={retWarehouseId} onChange={(e) => setRetWarehouseId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— выберите —</option>
              {warehouses
                .filter((w) => w.type === 'ADDRESS_LOCAL')
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Причина возврата</span>
            <select value={retReason} onChange={(e) => setRetReason(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {(meta?.writeOffReasons ?? []).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                  {r.value === 'DEFECT' ? ' → склад брака' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          {retLines.map((l, i) => {
            const it = itemById.get(l.itemId);
            return (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
                <label className="block sm:col-span-6">
                  <span className="mb-1 block text-xs text-dark-gray">Позиция</span>
                  <select value={l.itemId} onChange={(e) => setRetLine(i, { itemId: e.target.value })} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                    <option value="">— выберите —</option>
                    {items.map((it2) => (
                      <option key={it2.id} value={it2.id}>
                        {it2.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-3">
                  <span className="mb-1 block text-xs text-dark-gray">Кол-во{it ? `, ${it.unit}` : ''}</span>
                  <input type="number" min={0} step="any" value={l.quantity} onChange={(e) => setRetLine(i, { quantity: Number(e.target.value) })} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
                </label>
                <div className="sm:col-span-3">
                  {retLines.length > 1 && (
                    <button onClick={() => setRetLines((ls) => ls.filter((_, j) => j !== i))} className="text-sm text-dark-gray underline hover:text-red-700">
                      убрать
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={() => setRetLines((ls) => [...ls, emptyWoLine()])} className="text-sm text-primary underline">
            + позиция
          </button>
        </div>
        <Button onClick={() => void submitReturn()} disabled={busy || !retWarehouseId}>
          Создать возврат
        </Button>
      </Card>

      {/* Список документов */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-dark-gray">
                <th className="px-4 py-3">Документ</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Сумма</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-dark-gray">
                    Документов пока нет.
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="border-b border-ink/5">
                    <td className="px-4 py-2.5">
                      <button onClick={() => void openDetail(d.id)} className="text-primary underline">
                        {d.number}
                      </button>
                      <div className="text-xs text-dark-gray">
                        {typeLabel(d.type)} · {new Date(d.docDate).toLocaleDateString('ru')}
                        {d.discrepancy && <span className="ml-1 text-red-700">расхождение</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 ${statusColor[d.status] ?? 'text-dark-gray'}`}>{statusLabel(d.status)}</td>
                    <td className="px-4 py-2.5 text-right">{d.amount.toLocaleString('ru')} ₽</td>
                    <td className="px-4 py-2.5 text-right">
                      {d.type === 'RECEIPT' && d.status === 'DRAFT' && (
                        <button onClick={() => void post(d.id)} className="text-sm text-green-700 underline">
                          провести
                        </button>
                      )}
                      {d.type === 'TRANSFER' && d.status === 'DRAFT' && (
                        <button onClick={() => void ship(d.id)} className="text-sm text-green-700 underline">
                          отгрузить
                        </button>
                      )}
                      {d.type === 'TRANSFER' && d.status === 'SHIPPED' && (
                        <button onClick={() => void openDetail(d.id)} className="text-sm text-amber-700 underline">
                          принять
                        </button>
                      )}
                      {d.type === 'WRITE_OFF' && d.status === 'PENDING_APPROVAL' && canApprove && (
                        <button onClick={() => void approve(d.id)} className="text-sm text-amber-700 underline">
                          согласовать
                        </button>
                      )}
                      {d.type === 'WRITE_OFF' && (d.status === 'DRAFT' || d.status === 'APPROVED') && (
                        <button onClick={() => void post(d.id)} className="text-sm text-green-700 underline">
                          провести
                        </button>
                      )}
                      {d.type === 'RETURN' && d.status === 'DRAFT' && (
                        <button onClick={() => void post(d.id)} className="text-sm text-green-700 underline">
                          принять
                        </button>
                      )}
                      {d.status !== 'CANCELLED' && d.status !== 'POSTED' && (
                        <button onClick={() => void cancel(d.id)} className="ml-3 text-sm text-dark-gray underline hover:text-red-700">
                          отменить
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* Детали выбранного документа */}
        {detail && (
          <Card>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg text-ink">
                  {detail.number} · {typeLabel(detail.type)}
                </h2>
                <p className="text-sm text-dark-gray">
                  {statusLabel(detail.status)}
                  {detail.externalRef ? ` · ${detail.externalRef}` : ''}
                  {detail.supplier ? ` · ${detail.supplier.name}` : ''}
                  {detail.reason ? ` · причина: ${reasonLabel(detail.reason)}` : ''}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-sm text-dark-gray hover:text-ink">
                закрыть
              </button>
            </div>
            {detail.type === 'TRANSFER' ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left text-dark-gray">
                      <th className="py-2">Позиция</th>
                      <th className="py-2 text-right">Заказано</th>
                      <th className="py-2 text-right">Отгружено</th>
                      <th className="py-2 text-right">Получено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => {
                      const shipped = l.shippedQty ?? null;
                      const shortage = shipped != null && l.receivedQty != null ? shipped - l.receivedQty : 0;
                      return (
                        <tr key={l.id} className="border-b border-ink/5">
                          <td className="py-2 text-ink">{l.item.name}</td>
                          <td className="py-2 text-right text-dark-gray">
                            {l.quantity} {l.item.unit}
                          </td>
                          <td className="py-2 text-right text-dark-gray">{shipped ?? '—'}</td>
                          <td className="py-2 text-right">
                            {detail.status === 'SHIPPED' ? (
                              <input
                                type="number"
                                min={0}
                                max={shipped ?? undefined}
                                step="any"
                                value={recvQty[l.id] ?? 0}
                                onChange={(e) => setRecvQty((q) => ({ ...q, [l.id]: Number(e.target.value) }))}
                                className="w-24 rounded-md border border-ink/20 px-2 py-1.5 text-right text-sm"
                              />
                            ) : (
                              <>
                                <span className="text-ink">{l.receivedQty ?? '—'}</span>
                                {shortage > 0 && <span className="ml-1 text-xs text-red-700">−{shortage}</span>}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {detail.status === 'SHIPPED' && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-dark-gray">Получено меньше отгруженного → акт расхождения</span>
                    <Button onClick={() => void receiveDoc(detail.id)}>Подтвердить получение</Button>
                  </div>
                )}
                {detail.status === 'POSTED' && detail.discrepancy && (
                  <p className="mt-3 text-sm text-red-700">Зафиксирован акт расхождения (недостача в пути).</p>
                )}
              </>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left text-dark-gray">
                      <th className="py-2">Позиция</th>
                      <th className="py-2 text-right">Кол-во</th>
                      <th className="py-2 text-right">Цена</th>
                      <th className="py-2 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.id} className="border-b border-ink/5">
                        <td className="py-2 text-ink">
                          {l.item.name}
                          {l.expiryDate && <span className="ml-2 text-xs text-dark-gray">до {l.expiryDate.slice(0, 10)}</span>}
                        </td>
                        <td className="py-2 text-right">
                          {l.quantity} {l.item.unit}
                        </td>
                        <td className="py-2 text-right">{l.price.toLocaleString('ru')} ₽</td>
                        <td className="py-2 text-right">{l.amount.toLocaleString('ru')} ₽</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-right text-sm text-dark-gray">
                  Итого: <span className="text-ink">{detail.amount.toLocaleString('ru')} ₽</span>
                </p>
              </>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
