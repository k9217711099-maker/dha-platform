'use client';

import { useEffect, useState } from 'react';
import { adminApi, type ArrivalQueueItem, type CheckinFunnelReport, type PmsProperty } from '../../../lib/api';
import { useRequireAdmin, useAdminMe } from '../../../lib/use-admin';
import { DatePicker } from '../../../components/DatePicker';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { CheckinFunnelPanel } from '../shakhmatka/CheckinFunnelPanel';

const fieldCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

const STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  AWAITING: { label: 'Ожидание', cls: 'bg-slate-100 text-slate-600' },
  IDENTIFIED: { label: 'Контакт', cls: 'bg-indigo-50 text-indigo-600' },
  REGISTERED: { label: 'Регистрация', cls: 'bg-indigo-100 text-indigo-700' },
  PAID: { label: 'Оплачено', cls: 'bg-violet-100 text-violet-700' },
  READY: { label: 'Готов', cls: 'bg-emerald-100 text-emerald-700' },
  KEY_ISSUED: { label: 'Ключ выдан', cls: 'bg-emerald-500 text-white' },
  COMPLETED: { label: 'Заселён', cls: 'bg-sky-100 text-sky-700' },
  NO_SHOW: { label: 'Незаезд', cls: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Отменена', cls: 'bg-rose-100 text-rose-700' },
};

const GATE_DOT_LABEL: Record<string, string> = {
  contact_verified: 'Контакт',
  registration_approved: 'Регистрация',
  payment_paid: 'Оплата',
  room_assigned: 'Номер',
  time_window_open: 'Окно',
};

/** Очередь заезда «сегодня заезжают» + отчёт по воронке (CHECK-IN-TZ §11, спринт 6). */
export default function ArrivalsPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const can = (p: string) => me?.permissions.includes(p) ?? false;
  const [tab, setTab] = useState<'queue' | 'report'>('queue');

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Заезды</h1>
      <p className="mb-4 text-sm text-dark-gray">Очередь автоматизированного заселения: стадия воронки, шлюзы и быстрые действия стойки.</p>
      <div className="mb-5 flex gap-1 border-b border-ink/10">
        {([['queue', 'Очередь заезда'], ['report', 'Отчёт по воронке']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${tab === id ? 'border-ink font-medium text-ink' : 'border-transparent text-dark-gray hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {tab === 'queue' ? <QueueTab can={can} /> : <ReportTab />}
    </main>
  );
}

function QueueTab({ can }: { can: (p: string) => boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState<PmsProperty[]>([]);
  const [items, setItems] = useState<ArrivalQueueItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { void adminApi.pmsProperties().then(setProperties).catch(() => undefined); }, []);
  const load = () => {
    setItems(null);
    void adminApi.checkinQueue(date || today, propertyId || undefined).then(setItems).catch(() => setItems([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [date, propertyId]);

  const act = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id); setMsg('');
    try { await fn(); setMsg(okMsg); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusyId(null); }
  };

  const shift = (days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => shift(-1)} className="rounded-md border border-ink/20 px-2.5 py-2 text-sm text-ink hover:bg-ink/5">←</button>
        <DatePicker value={date} onChange={(v) => setDate(v || today)} className="w-44" />
        <button type="button" onClick={() => shift(1)} className="rounded-md border border-ink/20 px-2.5 py-2 text-sm text-ink hover:bg-ink/5">→</button>
        {date !== today ? <button type="button" onClick={() => setDate(today)} className="text-sm text-primary hover:underline">Сегодня</button> : null}
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={fieldCls}>
          <option value="">Все объекты</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {msg ? <span className="text-sm text-indigo-600">{msg}</span> : null}
      </div>

      {items === null ? <p className="text-sm text-dark-gray">Загрузка…</p> : items.length === 0 ? (
        <p className="text-sm text-dark-gray">На эту дату заездов нет.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10">
          {items.map((it) => {
            const sb = STAGE_BADGE[it.stage] ?? { label: it.stage, cls: 'bg-ink/10 text-ink' };
            const busy = busyId === it.bookingId;
            return (
              <div key={it.bookingId} className="border-b border-ink/5 bg-white last:border-b-0">
                <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <button type="button" onClick={() => setOpenId(openId === it.bookingId ? null : it.bookingId)} className="min-w-0 flex-1 text-left">
                    <span className="font-medium text-ink">{it.guestName ?? 'Гость'}</span>
                    <span className="text-dark-gray"> · {it.propertyName} · № {it.roomNumber ?? '—'}{it.arrivalTime ? ` · к ${it.arrivalTime}` : ''}</span>
                    <span className="block text-xs text-dark-gray">Бронь {it.bookingNumber ?? it.bookingId.slice(0, 8)}{it.guestPhone ? ` · ${it.guestPhone}` : ''}</span>
                  </button>

                  {/* Индикация шлюзов: красные точки с подписью */}
                  <span className="flex flex-none items-center gap-1">
                    {it.badGates.map((g) => (
                      <span key={g.key} title={g.reason ?? g.key} className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-600">
                        {GATE_DOT_LABEL[g.key] ?? g.key}
                      </span>
                    ))}
                  </span>
                  <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-medium ${sb.cls}`}>{sb.label}</span>

                  {/* Быстрые действия стойки */}
                  <span className="flex flex-none items-center gap-1.5">
                    {it.checkinStatus === 'SUBMITTED' && can('checkins') ? (
                      <button type="button" disabled={busy}
                        onClick={() => void act(it.bookingId, () => adminApi.approveCheckin(it.bookingId), 'Регистрация подтверждена')}
                        className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs text-white disabled:opacity-40">Подтвердить</button>
                    ) : null}
                    {!it.hasActiveKey && it.stage === 'READY' && can('guests') ? (
                      <button type="button" disabled={busy}
                        onClick={() => void act(it.bookingId, () => adminApi.issueKey(it.bookingId), 'Ключ выдан')}
                        className="rounded-md bg-ink px-2.5 py-1 text-xs text-beige disabled:opacity-40">Выдать ключ</button>
                    ) : null}
                    <button type="button" disabled={busy}
                      onClick={() => void act(it.bookingId, async () => {
                        const { url } = await adminApi.pmsCheckinLink(it.bookingId);
                        await navigator.clipboard.writeText(url).catch(() => undefined);
                      }, 'Ссылка скопирована')}
                      className="rounded-md border border-ink/20 px-2.5 py-1 text-xs text-ink hover:bg-ink/5 disabled:opacity-40">🔗</button>
                  </span>
                </div>
                {openId === it.bookingId ? (
                  <div className="border-t border-ink/5 bg-ink/[0.02] px-4 py-3">
                    <div className="max-w-md">
                      <CheckinFunnelPanel bookingId={it.bookingId} bookingStatus={it.status} />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportTab() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 24 * 3600e3).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [r, setR] = useState<CheckinFunnelReport | null>(null);

  useEffect(() => {
    setR(null);
    void adminApi.checkinReport(from, to).then(setR).catch(() => undefined);
  }, [from, to]);

  const Stat = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
    <div className="rounded-xl border border-ink/10 p-4">
      <p className={`text-2xl font-light ${accent ?? 'text-ink'}`}>{value}</p>
      <p className="mt-0.5 text-xs text-dark-gray">{label}</p>
    </div>
  );
  const Dist = ({ title, data, labels }: { title: string; data: Record<string, number>; labels?: Record<string, string> }) => (
    <div className="rounded-xl border border-ink/10 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">{title}</p>
      <ul className="space-y-1 text-sm">
        {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <li key={k} className="flex justify-between"><span className="text-ink">{labels?.[k] ?? k}</span><span className="text-dark-gray">{v}</span></li>
        ))}
      </ul>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { if (f) setFrom(f); if (t) setTo(t); }} />
      </div>
      {!r ? <p className="text-sm text-dark-gray">Загрузка…</p> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Заездов за период" value={r.total} />
            <Stat label="Автозаездов (без стойки)" value={r.autoCheckins} accent="text-emerald-600" />
            <Stat label="Эскалаций «не готов»" value={r.escalations} accent="text-amber-600" />
            <Stat label="Проблем с ключами" value={r.keyFailures} accent="text-rose-600" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Dist title="По стадии воронки" data={r.byStage} labels={Object.fromEntries(Object.entries(STAGE_BADGE).map(([k, v]) => [k, v.label]))} />
            <Dist title="По статусу брони" data={r.byStatus} />
            <Dist title="По каналу продаж" data={r.byChannel} />
          </div>
          <Dist title="События оркестратора" data={r.events} labels={{ invite: 'Приглашения', reminder: 'Напоминания', escalation: 'Эскалации', auto_checkin: 'Автозаезды', key_auto_issue: 'Авто-выдачи ключа', key_failed: 'Ошибки ключа', checkout_revoke: 'Отзыв после выезда', no_show: 'Авто-незаезды' }} />
        </div>
      )}
    </div>
  );
}
