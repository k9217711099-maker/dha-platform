'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import {
  adminApi,
  type WhAddress,
  type WhRecommendation,
  type WhRequestDetail,
  type WhRequestRow,
} from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';

const STATUS: Record<string, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Отправлена',
  APPROVED: 'Согласована',
  REJECTED: 'Отклонена',
  IN_PROGRESS: 'В работе',
  FULFILLED: 'Выполнена',
  CANCELLED: 'Отменена',
};
const statusColor: Record<string, string> = {
  SUBMITTED: 'text-amber-700',
  APPROVED: 'text-green-700',
  REJECTED: 'text-red-700',
  IN_PROGRESS: 'text-ink',
};
const PRIORITY: { value: string; label: string }[] = [
  { value: 'LOW', label: 'Низкий' },
  { value: 'NORMAL', label: 'Обычный' },
  { value: 'URGENT', label: 'Срочный' },
];

export default function WarehouseRequestsPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const canApprove = me?.permissions.includes('wh_documents') ?? false;

  const [addresses, setAddresses] = useState<WhAddress[]>([]);
  const [requests, setRequests] = useState<WhRequestRow[]>([]);
  const [detail, setDetail] = useState<WhRequestDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // форма
  const [addressId, setAddressId] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [comment, setComment] = useState('');
  const [recs, setRecs] = useState<WhRecommendation[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const loadRequests = () => adminApi.whRequests().then(setRequests).catch((e) => setError(e.message));

  useEffect(() => {
    if (ready) {
      adminApi.whAddresses().then(setAddresses).catch(() => undefined);
      void loadRequests();
    }
  }, [ready]);

  useEffect(() => {
    if (!addressId) {
      setRecs([]);
      setQty({});
      return;
    }
    adminApi
      .whRecommendations(addressId)
      .then((r) => {
        setRecs(r);
        setQty(Object.fromEntries(r.map((x) => [x.itemId, x.recommend])));
      })
      .catch((e) => setError(e.message));
  }, [addressId]);

  async function submit() {
    setError(null);
    setNotice(null);
    if (!addressId) return setError('Выберите адрес');
    const lines = recs.map((r) => ({ itemId: r.itemId, quantity: qty[r.itemId] ?? 0 })).filter((l) => l.quantity > 0);
    if (!lines.length) return setError('Укажите количество хотя бы по одной позиции');
    setBusy(true);
    try {
      const req = await adminApi.whCreateRequest({ addressId, priority, comment: comment || undefined, lines });
      setComment('');
      setNotice(`Заявка ${req.number} создана`);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setError(null);
    try {
      await adminApi.whApproveRequest(id);
      await loadRequests();
      if (detail?.id === id) setDetail(await adminApi.whRequest(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  async function reject(id: string) {
    const reason = prompt('Причина отклонения (необязательно)') ?? undefined;
    setError(null);
    try {
      await adminApi.whRejectRequest(id, reason);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }
  async function makeTransfer(id: string) {
    setError(null);
    setNotice(null);
    try {
      const doc = await adminApi.whCreateTransferFromRequest(id);
      setNotice(`Создано перемещение ${doc.number} (черновик) — проведите его в разделе «Документы»`);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  const addressName = (id: string | null) => addresses.find((a) => a.id === id)?.name ?? '—';

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Заявки на пополнение</h1>
      <p className="mb-5 text-sm text-dark-gray">
        Рекомендация по par stock (§5.7): нужно = par − доступный остаток на адресе. После согласования формируется перемещение со склада.
      </p>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 text-sm text-green-700">{notice}</p>}

      {/* Создание заявки */}
      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новая заявка</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Адрес</span>
            <select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              <option value="">— выберите адрес —</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Приоритет</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {PRIORITY.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Input id="comment" label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        {addressId && (
          <div className="overflow-x-auto">
            {recs.length === 0 ? (
              <p className="text-sm text-dark-gray">Для адреса нет позиций с заданным par stock. Задайте par в номенклатуре.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-dark-gray">
                    <th className="py-2">Позиция</th>
                    <th className="py-2 text-right">Par</th>
                    <th className="py-2 text-right">Есть</th>
                    <th className="py-2 text-right">Нужно</th>
                    <th className="py-2 text-right">Заказать</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.itemId} className="border-b border-ink/5">
                      <td className="py-2 text-ink">{r.name}</td>
                      <td className="py-2 text-right text-dark-gray">{r.par}</td>
                      <td className="py-2 text-right text-dark-gray">{r.available}</td>
                      <td className={`py-2 text-right ${r.recommend > 0 ? 'text-amber-700' : 'text-dark-gray'}`}>{r.recommend}</td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={qty[r.itemId] ?? 0}
                          onChange={(e) => setQty((q) => ({ ...q, [r.itemId]: Number(e.target.value) }))}
                          className="w-24 rounded-md border border-ink/20 px-2 py-1.5 text-right text-sm"
                        />
                        <span className="ml-1 text-xs text-dark-gray">{r.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <Button onClick={() => void submit()} disabled={busy || !addressId}>
          Создать заявку
        </Button>
      </Card>

      {/* Список заявок */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-dark-gray">
                <th className="px-4 py-3">Заявка</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-dark-gray">
                    Заявок пока нет.
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b border-ink/5 align-top">
                    <td className="px-4 py-2.5">
                      <button onClick={() => void adminApi.whRequest(r.id).then(setDetail)} className="text-primary underline">
                        {r.number}
                      </button>
                      <div className="text-xs text-dark-gray">
                        {addressName(r.addressId)}
                        {r.priority === 'URGENT' && <span className="ml-1 text-red-700">срочно</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 ${statusColor[r.status] ?? 'text-dark-gray'}`}>{STATUS[r.status] ?? r.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canApprove && r.status === 'SUBMITTED' && (
                        <>
                          <button onClick={() => void approve(r.id)} className="text-sm text-green-700 underline">
                            согласовать
                          </button>
                          <button onClick={() => void reject(r.id)} className="ml-3 text-sm text-dark-gray underline hover:text-red-700">
                            отклонить
                          </button>
                        </>
                      )}
                      {canApprove && r.status === 'APPROVED' && (
                        <button onClick={() => void makeTransfer(r.id)} className="text-sm text-primary underline">
                          создать перемещение
                        </button>
                      )}
                    </td>
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
                  {addressName(detail.addressId)} · {STATUS[detail.status] ?? detail.status}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-sm text-dark-gray hover:text-ink">
                закрыть
              </button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.id} className="border-b border-ink/5">
                    <td className="py-2 text-ink">{l.item.name}</td>
                    <td className="py-2 text-right text-dark-gray">
                      {l.quantity} {l.item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.comment && <p className="mt-3 text-sm text-dark-gray">Комментарий: {detail.comment}</p>}
          </Card>
        )}
      </div>
    </main>
  );
}
