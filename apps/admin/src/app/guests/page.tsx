'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type GuestDetails, type GuestListRow } from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';
import { useEsc } from '../../lib/use-esc';
import { tierMeta } from '../../lib/loyalty';
import { formatPhoneDisplay } from '../../lib/phone';

const TIERS = ['MEMBER', 'SILVER', 'GOLD', 'PLATINUM'];
const guestName = (g: { firstName: string | null; lastName: string | null }) =>
  `${g.lastName ?? ''} ${g.firstName ?? ''}`.trim() || 'Без имени';

export default function GuestsPage() {
  const ready = useRequireAdmin();
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('');
  const [rows, setRows] = useState<GuestListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GuestDetails | null>(null);
  const [amount, setAmount] = useState(500);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Префилл поиска из URL (?q=…) — переход из интеллектуального поиска в сайдбаре.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('q');
    if (p) setQuery(p);
  }, []);

  const loadList = useCallback(() => {
    if (!ready) return;
    setLoading(true);
    void adminApi.guestsList({ q: query || undefined, tier: tier || undefined })
      .then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')).finally(() => setLoading(false));
  }, [ready, query, tier]);

  // Дебаунс поиска.
  useEffect(() => { const t = setTimeout(loadList, 250); return () => clearTimeout(t); }, [loadList]);

  async function load(id: string) {
    setError(null);
    try { setData(await adminApi.guest(id)); } catch (e) { setError(e instanceof Error ? e.message : 'Не найдено'); setData(null); }
  }
  async function op(fn: () => Promise<unknown>) { await fn(); if (data) await load(data.id); }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="space-y-5 px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-light text-ink">База гостей</h1>
        <span className="text-sm text-dark-gray">{rows.length} гостей</span>
      </div>

      {/* Фильтры */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Input id="q" label="Поиск: телефон, почта, фамилия, имя или ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-dark-gray">Уровень лояльности</span>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              <option value="">Все уровни</option>
              {TIERS.map((t) => <option key={t} value={t}>{tierMeta(t).label}</option>)}
            </select>
          </label>
          {(query || tier) ? <button type="button" onClick={() => { setQuery(''); setTier(''); }} className="pb-2 text-sm text-primary hover:underline">Сбросить</button> : null}
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      {/* Список гостей */}
      <Card className="p-0">
        {loading && rows.length === 0 ? <p className="px-4 py-6 text-sm text-dark-gray">Загрузка…</p> : null}
        {!loading && rows.length === 0 ? <p className="px-4 py-6 text-sm text-dark-gray">Гостей не найдено.</p> : null}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-dark-gray">
                <th className="px-4 py-2.5 font-medium">Гость</th>
                <th className="px-3 py-2.5 font-medium">Контакты</th>
                <th className="px-3 py-2.5 font-medium">Уровень</th>
                <th className="px-3 py-2.5 text-center font-medium">Броней</th>
                <th className="px-3 py-2.5 font-medium">Примечание</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const tm = tierMeta(g.loyaltyTier);
                return (
                  <tr key={g.id} className={`border-b border-ink/5 last:border-0 hover:bg-ink/[0.02] ${data?.id === g.id ? 'bg-primary-50' : ''}`}>
                    <td className="px-4 py-2.5"><button type="button" onClick={() => void load(g.id)} className="font-medium text-primary hover:underline">{guestName(g)}</button></td>
                    <td className="px-3 py-2.5 text-dark-gray">{g.phone ? formatPhoneDisplay(g.phone) : ''}{g.phone && g.email ? ' · ' : ''}{g.email ?? ''}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] ${tm.badge}`}>{tm.label}</span></td>
                    <td className="px-3 py-2.5 text-center text-dark-gray">{g.bookingsCount}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-dark-gray" title={g.guestNotes ?? ''}>{g.guestNotes ? `📌 ${g.guestNotes}` : ''}</td>
                    <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => void load(g.id)} className="text-xs text-primary hover:underline">Открыть</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {data && <GuestDetailCard data={data} amount={amount} setAmount={setAmount} comment={comment} setComment={setComment} op={op} onClose={() => setData(null)} onNotesSaved={() => { void load(data.id); loadList(); }} />}
    </main>
  );
}

function GuestDetailCard({ data, amount, setAmount, comment, setComment, op, onClose, onNotesSaved }: {
  data: GuestDetails; amount: number; setAmount: (n: number) => void; comment: string; setComment: (s: string) => void;
  op: (fn: () => Promise<unknown>) => Promise<void>; onClose: () => void; onNotesSaved: () => void;
}) {
  const [notes, setNotes] = useState(data.guestNotes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  useEsc(onClose);
  useEffect(() => setNotes(data.guestNotes ?? ''), [data.id, data.guestNotes]);
  const saveNotes = async () => {
    setSavingNotes(true);
    try { await adminApi.updateGuest(data.id, { guestNotes: notes }); onNotesSaved(); } finally { setSavingNotes(false); }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-2 w-full max-w-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
      <Card>
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h2 className="text-lg text-ink">{guestName(data)}</h2>
            <p className="text-sm text-dark-gray">{data.email ?? data.phone ?? '—'} · уровень {tierMeta(data.loyaltyTier).label}</p>
            <p className="mt-1 text-sm text-dark-gray">Баллы: доступно {data.loyalty.availableBalance}, ожидают {data.loyalty.pendingBalance}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>
        {/* Закреплённое примечание гостя (§7) */}
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-800">📌 Примечание гостя (видно во всех бронях)</p>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-amber-300/70 bg-white px-3 py-2 text-sm" placeholder="Пожелания, особенности, важные детали…" />
          {notes !== (data.guestNotes ?? '') ? <button type="button" onClick={saveNotes} disabled={savingNotes} className="mt-1.5 rounded-md bg-ink px-3 py-1 text-xs text-beige disabled:opacity-40">Сохранить примечание</button> : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg text-ink">Лояльность — ручные операции</h2>
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <Input id="amt" label="Баллы" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Input id="cmt" label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={() => void op(() => adminApi.accrue(data.id, amount, comment || 'admin'))}>Начислить</Button>
            <Button variant="secondary" onClick={() => void op(() => adminApi.deduct(data.id, amount, comment || 'admin'))}>Списать</Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-gray">Уровень:</span>
          {TIERS.map((t) => (
            <button key={t} onClick={() => void op(() => adminApi.adjustTier(data.id, t))}
              className={`rounded-md px-2 py-1 text-xs ${data.loyaltyTier === t ? 'bg-ink text-white' : 'border border-ink/20 text-dark-gray'}`}>{t}</button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg text-ink">Бронирования</h2>
        <div className="space-y-2">
          {data.bookings.length === 0 ? <p className="text-sm text-dark-gray">Броней нет.</p> : null}
          {data.bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between border-t border-ink/10 pt-2 text-sm">
              <div>
                <p className="text-ink">{b.property}</p>
                <p className="text-xs text-dark-gray">{new Date(b.checkIn).toLocaleDateString('ru')} — {new Date(b.checkOut).toLocaleDateString('ru')} · {b.status} · {b.paymentStatus}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button onClick={() => void op(() => adminApi.issueKey(b.id))}>Выдать ключ</Button>
                <Button variant="secondary" onClick={() => void op(() => adminApi.revokeKey(b.id))}>Отозвать</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      </div>
    </div>
  );
}
