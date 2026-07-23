'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { adminApi, fileUrl, type BookingAuditEntry, type BookingKeyDoor, type BookingKeyView, type BookingTag, type Extra, type GuestConversation, type LockRecord, type MarketingKind, type MarketingOption, type OpsTask, type PmsBooking, type PmsRatePlan, type PmsRoom, type RoomFundCategory, type UmnicoReachChannel } from '../../../lib/api';
import { STATUS as OPS_STATUS } from '../../ops/shared';
import { CheckinFunnelPanel } from './CheckinFunnelPanel';
import { PassportPanel } from './PassportPanel';
import { FinanceTab } from './FinanceTab';
import { balanceBadge, guestName, money, paidAmount, statusMeta } from './booking-view';
import { useEsc } from '../../../lib/use-esc';
import { useAdminMe } from '../../../lib/use-admin';
import { formatPhoneDisplay, normalizePhone } from '../../../lib/phone';
import { tierMeta } from '../../../lib/loyalty';
import { TAG_PALETTE, tagHex } from '../../../lib/tags';
import { PhoneInput } from '../../../components/PhoneInput';
import { DatePicker } from '../../../components/DatePicker';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');
const fmtDow = (iso: string) => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()];

type Tab = 'main' | 'invoice' | 'lock' | 'journal';
const TABS: { id: Tab; label: string }[] = [
  { id: 'main', label: 'Основное' },
  { id: 'invoice', label: 'Счёт' },
  { id: 'lock', label: 'Пульт от замка' },
  { id: 'journal', label: 'Журнал' },
];

/**
 * Полное окно бронирования (эталон Bnovo) — открывается по клику на номер брони.
 * Вкладка «Основное»: слева сводка + примечания на видном месте, справа модуль задач
 * (уборка/инженерия). «Услуги» — доп-услуги брони с параметрами. «Счёт» — реквизиты
 * организации (Настройки → Финансы) для выставления счёта.
 */
export function BookingWindow({ booking, rooms, onClose, onChanged }: {
  booking: PmsBooking; rooms: PmsRoom[]; onClose: () => void; onChanged: () => void;
}) {
  useEsc(onClose);
  const me = useAdminMe();
  const can = (p: string) => me?.permissions.includes(p) ?? false;
  const [b, setB] = useState<PmsBooking>(booking);
  const [tab, setTab] = useState<Tab>('main');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Свежая бронь с доп-услугами (в списке шахматки extras может не быть).
  const reload = () => void adminApi.pmsBooking(booking.id).then(setB).catch(() => undefined);
  const reloadAll = () => { reload(); onChanged(); };
  useEffect(() => { setB(booking); reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [booking.id]);

  const act = async (fn: () => Promise<PmsBooking>) => {
    setBusy(true); setErr('');
    try { const upd = await fn(); setB(upd); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  const sm = statusMeta(b.status);

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-2 w-full max-w-5xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-light text-ink">{guestName(b)}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs ${sm.badge}`}>{sm.label}</span>
            </div>
            <p className="mt-1 text-sm text-dark-gray">Бронь № {b.bookingNumber ?? '—'} · от {fmtDate(b.createdAt)} · {b.channel}</p>
          </div>
          <button type="button" onClick={onClose} className="text-3xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>

        {/* Статусы */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 px-6 py-3">
          <StatusControls b={b} busy={busy} act={act} canReopen={can('pms_reopen_checkout')} />
          {err ? <span className="ml-auto text-sm text-red-600">{err}</span> : null}
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 border-b border-ink/10 px-6">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${tab === t.id ? 'border-ink font-medium text-ink' : 'border-transparent text-dark-gray hover:text-ink'}`}>{t.label}</button>
          ))}
        </div>

        <div className="px-6 py-5">
          {tab === 'main' ? <MainTab b={b} rooms={rooms} busy={busy} act={act} can={can} reloadAll={reloadAll} /> : null}
          {tab === 'invoice' ? <FinanceTab b={b} onChanged={reloadAll} /> : null}
          {tab === 'lock' ? <LockTab b={b} can={can} /> : null}
          {tab === 'journal' ? <JournalTab bookingId={b.id} /> : null}
        </div>
      </div>
    </div>
  );
}

/** Цветные кнопки смены статуса (возврат заселения; открытие после выезда — по праву). */
function StatusControls({ b, busy, act, canReopen }: { b: PmsBooking; busy: boolean; act: (fn: () => Promise<PmsBooking>) => void; canReopen: boolean }) {
  const Btn = ({ label, active, activeCls, onClick, disabled }: { label: string; active: boolean; activeCls: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={`rounded-md px-3 py-1.5 text-sm transition disabled:opacity-40 ${active ? `${activeCls} text-white` : 'border border-ink/20 text-ink hover:bg-ink/5'}`}>{label}</button>
  );
  const cancel = () => { if (confirm('Отменить бронь?')) act(() => adminApi.pmsCancelBooking(b.id, 'Отменена вручную')); };
  const out = b.status === 'CHECKED_OUT';
  return (
    <>
      <Btn label="Новое" activeCls="bg-emerald-500" active={b.status === 'PENDING'} onClick={() => act(() => adminApi.pmsUpdateBooking(b.id, { status: 'PENDING' }))} disabled={!['PENDING', 'CONFIRMED'].includes(b.status)} />
      <Btn label="Проверено" activeCls="bg-amber-400" active={b.status === 'CONFIRMED'} onClick={() => act(() => (b.status === 'CHECKED_IN' ? adminApi.pmsRevertCheckIn(b.id) : adminApi.pmsUpdateBooking(b.id, { status: 'CONFIRMED' })))} disabled={!['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(b.status)} />
      <Btn label="Заселён" activeCls="bg-sky-500" active={b.status === 'CHECKED_IN'} onClick={() => act(() => (out ? adminApi.pmsReopenBooking(b.id) : adminApi.pmsCheckIn(b.id)))} disabled={out ? !canReopen : b.status !== 'CONFIRMED'} />
      {b.status === 'CHECKED_IN' || out ? <Btn label="Выехал" activeCls="bg-slate-500" active={out} onClick={() => act(() => adminApi.pmsCheckOut(b.id))} disabled={out} /> : null}
      <Btn label="Отменён" activeCls="bg-rose-500" active={b.status === 'CANCELLED'} onClick={cancel} disabled={['CHECKED_OUT', 'CANCELLED'].includes(b.status)} />
      {out && canReopen ? <span className="text-xs text-dark-gray">Выехал → «Заселён» доступно администратору</span> : null}
    </>
  );
}

/** Вкладка «Основное»: примечание, заказчик (связь/редактирование), бронирование (правки), услуги, финансы; задачи справа. */
/**
 * Вкладка «Пульт от замка» (#2): окно доступа (преднастроено по датам/часам заезда-выезда),
 * PIN-коды дверей, выдать/отозвать ключ. Коды видны только пока ключ активен.
 */
function LockTab({ b, can }: { b: PmsBooking; can: (p: string) => boolean }) {
  const [view, setView] = useState<BookingKeyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canManage = can('guests');
  const load = () => {
    void adminApi.bookingKey(b.id).then(setView).catch(() => setNote('Не удалось загрузить состояние ключа'));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [b.id]);
  const issue = async () => {
    setBusy(true); setNote(null);
    try { setView(await adminApi.issueKey(b.id)); setNote('Ключ выдан.'); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Не удалось выдать ключ'); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true); setNote(null);
    try { await adminApi.revokeKey(b.id); load(); setNote('Ключ отозван.'); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  };
  const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const statusRu = (s: string) => s === 'ACTIVE' ? 'активен' : s === 'NOT_ISSUED' ? 'не выдан' : s === 'REVOKED' ? 'отозван' : s === 'EXPIRED' ? 'истёк' : s.toLowerCase();
  const hasActive = view?.doors.some((d) => d.status === 'ACTIVE') ?? false;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink/10 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">Окно доступа (преднастроено по заезду/выезду)</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="block text-xs text-dark-gray">Заезд</span><span className="text-ink">{fmtDate(b.checkIn)}</span></div>
          <div><span className="block text-xs text-dark-gray">Выезд</span><span className="text-ink">{fmtDate(b.checkOut)}</span></div>
          <div><span className="block text-xs text-dark-gray">Ключ действует с</span><span className="text-ink">{dt(view?.validFrom ?? null)}</span></div>
          <div><span className="block text-xs text-dark-gray">по</span><span className="text-ink">{dt(view?.validUntil ?? null)}</span></div>
        </div>
      </div>

      {note ? <p className="text-sm text-primary">{note}</p> : null}

      <div className="rounded-xl border border-ink/10 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-dark-gray">Двери и коды</p>
          {canManage ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => void issue()} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-xs text-beige disabled:opacity-40">{busy ? '…' : 'Выдать ключ'}</button>
              {hasActive ? <button type="button" onClick={() => void revoke()} disabled={busy} className="rounded-md border border-ink/20 px-3 py-1.5 text-xs disabled:opacity-40">Отозвать</button> : null}
            </div>
          ) : null}
        </div>
        {view === null ? (
          <p className="text-sm text-dark-gray">Загрузка…</p>
        ) : view.doors.length === 0 ? (
          <div>
            <p className="text-sm text-dark-gray">Ключей пока нет.</p>
            {view.reasons.length ? <ul className="mt-1 list-disc pl-4 text-xs text-dark-gray">{view.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
          </div>
        ) : (
          <div className="space-y-2">
            {view.doors.map((d, i) => (
              <DoorRow key={i} door={d} canManage={canManage} statusRu={statusRu} validUntil={view.validUntil} />
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-dark-gray">Коды показываются, пока ключ активен и действует сейчас. После выезда доступ удаляется автоматически.</p>
    </div>
  );
}

/**
 * Одна дверь брони с «пультом» (#2): удалённое открытие, генерация временного кода,
 * настраиваемого кода (свой PIN), просмотр журнала входов замка. Каждая дверь ведёт
 * своё состояние — панели независимы.
 */
function DoorRow({ door, canManage, statusRu, validUntil }: {
  door: BookingKeyDoor;
  canManage: boolean;
  statusRu: (s: string) => string;
  validUntil: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<'temp' | 'custom' | 'log' | null>(null);
  const [dur, setDur] = useState<'2' | '6' | '24' | 'out'>('6');
  const [customPin, setCustomPin] = useState('');
  const [genPin, setGenPin] = useState<string | null>(null);
  const [records, setRecords] = useState<LockRecord[] | null>(null);

  const windowMs = () => {
    const startMs = Date.now();
    const byDur = startMs + Number(dur) * 3_600_000;
    const endMs = dur === 'out' && validUntil ? new Date(validUntil).getTime() : byDur;
    return { startMs, endMs: endMs > startMs ? endMs : startMs + 3_600_000 };
  };
  const togglePanel = (p: 'temp' | 'custom' | 'log') => { setMsg(null); setGenPin(null); setPanel((cur) => (cur === p ? null : p)); };

  const remoteOpen = async () => {
    setBusy(true); setMsg(null);
    try { await adminApi.ttlockUnlock(door.ttlockLockId); setMsg('Команда на открытие отправлена ✓'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Не удалось открыть'); }
    finally { setBusy(false); }
  };
  const makeTemp = async () => {
    setBusy(true); setMsg(null); setGenPin(null);
    try {
      const { startMs, endMs } = windowMs();
      const r = await adminApi.ttlockPasscode({ ttlockLockId: door.ttlockLockId, mode: 'get', startMs, endMs, name: `Врем. · ${door.doorName}` });
      setGenPin(r.pin); setMsg('Временный код создан.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Не удалось создать код'); }
    finally { setBusy(false); }
  };
  const makeCustom = async () => {
    if (!/^\d{4,9}$/.test(customPin)) { setMsg('PIN — от 4 до 9 цифр.'); return; }
    setBusy(true); setMsg(null); setGenPin(null);
    try {
      const { startMs, endMs } = windowMs();
      const r = await adminApi.ttlockPasscode({ ttlockLockId: door.ttlockLockId, mode: 'add', pin: customPin, startMs, endMs, name: `Свой · ${door.doorName}` });
      setGenPin(r.pin); setMsg('Настраиваемый код записан на замок.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Не удалось записать код (для своего PIN нужен шлюз/Bluetooth рядом)'); }
    finally { setBusy(false); }
  };
  const loadLog = async () => {
    setBusy(true); setMsg(null);
    try {
      const to = Date.now(); const from = to - 7 * 86_400_000;
      setRecords(await adminApi.ttlockRecords(door.ttlockLockId, from, to));
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Не удалось загрузить журнал'); }
    finally { setBusy(false); }
  };
  const openLog = () => { togglePanel('log'); if (!records) void loadLog(); };
  const fmtAt = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const durLabel = (
    <select value={dur} onChange={(e) => setDur(e.target.value as typeof dur)} className="rounded-md border border-ink/20 bg-white px-2 py-1 text-xs">
      <option value="2">2 часа</option>
      <option value="6">6 часов</option>
      <option value="24">24 часа</option>
      {validUntil ? <option value="out">до выезда</option> : null}
    </select>
  );

  return (
    <div className="rounded-lg border border-ink/10 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-ink">{door.doorName}</p>
          <p className="text-xs text-dark-gray">{statusRu(door.status)}{door.canRemoteOpen ? ' · есть шлюз' : ' · без шлюза'}</p>
        </div>
        {door.pin ? <span className="rounded-md bg-ink/5 px-3 py-1 font-mono text-base tracking-widest text-ink">{door.pin}</span> : <span className="text-xs text-dark-gray">PIN скрыт</span>}
      </div>

      {canManage ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void remoteOpen()} disabled={busy || !door.canRemoteOpen} title={door.canRemoteOpen ? 'Открыть дверь удалённо через шлюз' : 'Нужен шлюз (gateway)'} className="rounded-md bg-ink px-2.5 py-1 text-xs text-beige disabled:opacity-40">🔓 Открыть удалённо</button>
          <button type="button" onClick={() => togglePanel('temp')} disabled={busy} className={`rounded-md border px-2.5 py-1 text-xs ${panel === 'temp' ? 'border-ink bg-ink/5' : 'border-ink/20'}`}>⏱ Временный код</button>
          <button type="button" onClick={() => togglePanel('custom')} disabled={busy} className={`rounded-md border px-2.5 py-1 text-xs ${panel === 'custom' ? 'border-ink bg-ink/5' : 'border-ink/20'}`}>🔢 Свой код</button>
          <button type="button" onClick={openLog} disabled={busy} className={`rounded-md border px-2.5 py-1 text-xs ${panel === 'log' ? 'border-ink bg-ink/5' : 'border-ink/20'}`}>📜 Журнал входов</button>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-primary">{msg}</p> : null}
      {genPin ? <p className="mt-1 text-sm">Код: <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-base tracking-widest text-emerald-700">{genPin}</span></p> : null}

      {panel === 'temp' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-ink/[0.03] p-2">
          <span className="text-xs text-dark-gray">Срок:</span>{durLabel}
          <button type="button" onClick={() => void makeTemp()} disabled={busy} className="rounded-md bg-ink px-3 py-1 text-xs text-beige disabled:opacity-40">Создать код</button>
          <span className="text-[11px] text-dark-gray">Код по алгоритму TTLock — работает без шлюза.</span>
        </div>
      ) : null}

      {panel === 'custom' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-ink/[0.03] p-2">
          <input value={customPin} onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="PIN 4–9 цифр" className="w-28 rounded-md border border-ink/20 px-2 py-1 text-sm" />
          <span className="text-xs text-dark-gray">Срок:</span>{durLabel}
          <button type="button" onClick={() => void makeCustom()} disabled={busy} className="rounded-md bg-ink px-3 py-1 text-xs text-beige disabled:opacity-40">Записать код</button>
          <span className="text-[11px] text-dark-gray">Свой PIN пишется на замок — нужен шлюз или Bluetooth рядом.</span>
        </div>
      ) : null}

      {panel === 'log' ? (
        <div className="mt-2 rounded-md bg-ink/[0.03] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-dark-gray">Журнал за 7 дней</span>
            <button type="button" onClick={() => void loadLog()} disabled={busy} className="text-xs text-primary hover:underline disabled:opacity-40">Обновить</button>
          </div>
          {records === null ? <p className="text-xs text-dark-gray">Загрузка…</p>
            : records.length === 0 ? <p className="text-xs text-dark-gray">Событий нет.</p>
            : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {records.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-b border-ink/5 pb-1">
                    <span className="min-w-0 truncate text-ink">{r.success ? '✅' : '⛔'} {r.who || '—'}</span>
                    <span className="shrink-0 text-dark-gray">{r.type} · {fmtAt(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : null}
    </div>
  );
}

function MainTab({ b, rooms, busy, act, can, reloadAll }: { b: PmsBooking; rooms: PmsRoom[]; busy: boolean; act: (fn: () => Promise<PmsBooking>) => void; can: (p: string) => boolean; reloadAll: () => void }) {
  const [note, setNote] = useState(b.comment ?? '');
  useEffect(() => setNote(b.comment ?? ''), [b.comment]);
  const total = b.totalPrice + b.extrasTotal;
  const paid = paidAmount(b);
  const bal = balanceBadge(b, new Date().toISOString().slice(0, 10));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {/* Примечание гостя — на видном месте */}
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-800">📌 Примечание к брони</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border border-amber-300/70 bg-white px-3 py-2 text-sm" placeholder="Пожелания гостя, важные детали…" />
          {note !== (b.comment ?? '') ? <button type="button" onClick={() => act(() => adminApi.pmsUpdateBooking(b.id, { comment: note }))} disabled={busy} className="mt-1.5 rounded-md bg-ink px-3 py-1 text-xs text-beige disabled:opacity-40">Сохранить</button> : null}
        </div>

        <GuestSection b={b} onSaved={reloadAll} />
        <TagsSection b={b} onChanged={reloadAll} />
        <EditBookingSection b={b} rooms={rooms} act={act} busy={busy} canRates={can('pms_rates')} />
        <AdditionalInfoSection b={b} />
        <MarketingSection b={b} act={act} busy={busy} />

        {/* Финансы */}
        <div className="rounded-xl border border-ink/10 p-4">
          <FinRow label="Проживание" value={money(b.totalPrice)} />
          <FinRow label="Доп. услуги" value={money(b.extrasTotal)} />
          <FinRow label="Итого" value={money(total)} strong />
          <FinRow label="Оплачено" value={money(paid)} />
          <FinRow label="Остаток к оплате" value={money(Math.max(0, total - paid))} />
          {bal ? <div className="mt-1 flex justify-between text-sm"><span className="text-dark-gray">Баланс клиента</span><span className={bal.kind === 'green' ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>{bal.kind === 'green' ? '+' : '−'}{money(bal.amount)}</span></div> : null}
        </div>

        {/* Доп-услуги (перенесены в «Основное») */}
        <div className="rounded-xl border border-ink/10 p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-dark-gray">Доп. услуги</p>
          <ServicesTab b={b} onChanged={reloadAll} />
        </div>
      </div>

      {/* Правая часть — заселение + задачи */}
      <div className="space-y-5 lg:col-span-1">
        <CheckinFunnelPanel bookingId={b.id} bookingStatus={b.status} />
        <PassportPanel bookingId={b.id} />
        <TasksModule b={b} />
      </div>
    </div>
  );
}

/** Заказчик: каналы связи (звонок, WhatsApp, Telegram, почта, Umnico), лояльность, редактирование контактов. */
function GuestSection({ b, onSaved }: { b: PmsBooking; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [firstName, setFirstName] = useState(b.guest?.firstName ?? '');
  const [lastName, setLastName] = useState(b.guest?.lastName ?? '');
  const [phone, setPhone] = useState(b.guest?.phone ?? '');
  const [email, setEmail] = useState(b.guest?.email ?? '');
  const [tier, setTier] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<{ availableBalance: number; pendingBalance: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // История переписки с гостем прямо из брони (#12).
  const [showHistory, setShowHistory] = useState(false);
  const [convos, setConvos] = useState<GuestConversation[] | null>(null);
  const [openConvo, setOpenConvo] = useState<string | null>(null);
  // «Написать гостю» через подключённый канал Umnico (#12).
  const [showCompose, setShowCompose] = useState(false);
  const [reachChannels, setReachChannels] = useState<UmnicoReachChannel[] | null>(null);
  const [reachSaId, setReachSaId] = useState<number | null>(null);
  const [reachText, setReachText] = useState('');
  const [reachBusy, setReachBusy] = useState(false);
  const [reachNote, setReachNote] = useState<string | null>(null);
  const gid = b.guest?.id;
  useEffect(() => {
    if (!gid) return;
    void adminApi.guest(gid).then((g) => { setTier(g.loyaltyTier); setLoyalty(g.loyalty); setNotes(g.guestNotes ?? ''); setSavedNotes(g.guestNotes ?? ''); }).catch(() => undefined);
  }, [gid]);
  useEffect(() => { setFirstName(b.guest?.firstName ?? ''); setLastName(b.guest?.lastName ?? ''); setPhone(b.guest?.phone ?? ''); setEmail(b.guest?.email ?? ''); }, [b.guest]);

  const save = async () => {
    if (!gid) return; setBusy(true);
    try { await adminApi.updateGuest(gid, { firstName, lastName, phone: normalizePhone(phone), email, guestNotes: notes }); setSavedNotes(notes); setEdit(false); onSaved(); } catch { /* ignore */ } finally { setBusy(false); }
  };
  const reloadHistory = () => {
    if (gid) void adminApi.guestConversations(gid).then(setConvos).catch(() => setConvos([]));
  };
  const toggleHistory = () => {
    setShowHistory((v) => !v);
    if (!showHistory && convos === null) reloadHistory();
  };
  // Живое обновление истории переписки, пока раздел открыт (новые сообщения появляются
  // без перезагрузки страницы — «как в чате»). Опрос каждые 5 секунд.
  useEffect(() => {
    if (!showHistory || !gid) return;
    const t = setInterval(reloadHistory, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, gid]);
  // Подключённые каналы Umnico грузим при открытии карточки — показываем активные каналы
  // связи и выбираем канал для «Написать гостю» (#12; вместо статичных wa.me/t.me-ссылок).
  useEffect(() => {
    if (!b.guest?.phone) return;
    void adminApi
      .umnicoReachChannels()
      .then((cs) => {
        const active = cs.filter((c) => !c.status || /open|active|connect|1/i.test(c.status));
        setReachChannels(active.length ? active : cs);
        setReachSaId((prev) => prev ?? (active[0]?.id ?? cs[0]?.id ?? null));
      })
      .catch(() => setReachChannels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.guest?.phone]);
  const openCompose = () => { setShowCompose((v) => !v); setReachNote(null); };
  const sendReach = async () => {
    const text = reachText.trim();
    if (!text || !reachSaId || !b.guest?.phone || reachBusy) return;
    setReachBusy(true);
    setReachNote(null);
    try {
      const r = await adminApi.umnicoReachOut({ guestId: gid, phone: b.guest.phone, saId: reachSaId, text });
      if (r.ok) {
        setReachText('');
        setReachNote('Сообщение отправлено гостю.');
        setShowHistory(true);
        reloadHistory();
      } else {
        setReachNote(`Не удалось отправить: ${r.error ?? 'ошибка'}`);
      }
    } catch (e) {
      setReachNote(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setReachBusy(false);
    }
  };
  const CHANNEL_RU: Record<string, string> = {
    WEB: 'Сайт', APP: 'Приложение', TELEGRAM: 'Telegram', TELEGRAM_DIRECT: 'Telegram',
    MAX: 'MAX', WHATSAPP: 'WhatsApp', UMNICO: 'Умнико', ADMIN: 'Админка',
  };
  const SUBCHANNEL_RU: Record<string, string> = {
    telegram: 'Telegram', telebot: 'Telegram', telegramV2: 'Telegram', whatsapp: 'WhatsApp',
    whatsapp2: 'WhatsApp', whatsappV2: 'WhatsApp', instagram: 'Instagram', instagramV3: 'Instagram',
    vk: 'ВКонтакте', viber: 'Viber', avito: 'Avito', ok: 'Одноклассники', fb_messenger: 'Messenger', max: 'MAX',
  };
  const threadLabel = (channel: string, sub?: string | null) =>
    (CHANNEL_RU[channel] ?? channel) + (sub ? ` · ${SUBCHANNEL_RU[sub] ?? sub}` : '');
  // Группируем диалоги гостя «1 канал = 1 чат»: объединяем переписки одного (под)канала в одну
  // ленту, сообщения по времени. Так 2 диалога Umnico·Telegram показываются как один чат.
  const threads = useMemo(() => {
    if (!convos) return null;
    const map = new Map<string, { key: string; channel: string; subChannel: string | null; messages: GuestConversation['messages']; updatedAt: string }>();
    for (const c of convos) {
      const key = `${c.channel}|${c.subChannel ?? ''}`;
      let g = map.get(key);
      if (!g) { g = { key, channel: c.channel, subChannel: c.subChannel ?? null, messages: [], updatedAt: c.updatedAt }; map.set(key, g); }
      g.messages.push(...c.messages);
      if (c.updatedAt > g.updatedAt) g.updatedAt = c.updatedAt;
    }
    const arr = [...map.values()];
    for (const g of arr) g.messages.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    arr.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
    return arr;
  }, [convos]);

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Заказчик и гости</p>
        {gid && !edit ? <button type="button" onClick={() => setEdit(true)} className="text-xs text-primary hover:underline">Редактировать</button> : null}
      </div>
      {edit ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" className="rounded-md border border-ink/20 px-3 py-2 text-sm" />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" className="rounded-md border border-ink/20 px-3 py-2 text-sm" />
          </div>
          <PhoneInput value={phone} onChange={setPhone} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Почта" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Примечание гостя (закрепляется за гостем, видно во всех его бронях)" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-sm text-beige disabled:opacity-40">Сохранить</button>
            <button type="button" onClick={() => setEdit(false)} className="rounded-md border border-ink/20 px-3 py-1.5 text-sm">Отмена</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-ink">{guestName(b)}</span>
            {tier ? <span className={`rounded-full px-2 py-0.5 text-[10px] ${tierMeta(tier).badge}`}>{tierMeta(tier).label} · {tierMeta(tier).earn}</span> : null}
          </div>
          {loyalty ? <p className="mb-1 text-xs text-dark-gray">Баллы: {loyalty.availableBalance} доступно{loyalty.pendingBalance ? ` · ${loyalty.pendingBalance} ожидают` : ''}</p> : null}
          {savedNotes ? <div className="mb-2 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2"><p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-800">📌 Примечание гостя</p><p className="whitespace-pre-line text-sm text-ink">{savedNotes}</p></div> : null}
          {b.guest?.phone ? <Row label="Телефон"><a href={`tel:${b.guest.phone}`} className="text-ink">{formatPhoneDisplay(b.guest.phone)}</a></Row> : null}
          {b.guest?.email ? <Row label="Почта"><a href={`mailto:${b.guest.email}`} className="text-ink">{b.guest.email}</a></Row> : null}
          <Row label="Гостей">{(b.adults ?? b.guests)} взр{b.children ? ` · ${b.children} дет` : ''}</Row>
          {/* Подключённые каналы связи (#12): реальные активные каналы Umnico вместо
              статичных wa.me/t.me-ссылок + «Написать гостю» через выбранный канал. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-dark-gray">Каналы:</span>
            {reachChannels === null ? (
              <span className="text-[11px] text-dark-gray">загрузка…</span>
            ) : reachChannels.length === 0 ? (
              <span className="text-[11px] text-dark-gray">нет подключённых</span>
            ) : (
              reachChannels.map((c) => (
                <span key={c.id} className="rounded-md bg-ink/[0.06] px-2 py-0.5 text-[11px] text-ink">{c.label}</span>
              ))
            )}
            {b.guest?.phone ? (
              <button type="button" onClick={openCompose} className={`rounded-md px-2.5 py-1 text-xs font-medium ${showCompose ? 'bg-primary text-white' : 'bg-primary-100 text-primary-700'}`}>✍ Написать гостю</button>
            ) : null}
          </div>

          {/* «Написать гостю» через подключённый канал Umnico (#12) */}
          {showCompose && b.guest?.phone ? (
            <div className="mt-2 rounded-lg border border-primary-100 bg-primary-50/40 p-2.5">
              {reachChannels === null ? (
                <p className="text-xs text-dark-gray">Загрузка каналов…</p>
              ) : reachChannels.length === 0 ? (
                <p className="text-xs text-dark-gray">Нет подключённых каналов Umnico. Подключите в «AI → Настройки и каналы».</p>
              ) : (
                <>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-dark-gray">Канал:</span>
                    <select value={reachSaId ?? ''} onChange={(e) => setReachSaId(Number(e.target.value))} className="flex-1 rounded-md border border-ink/20 bg-white px-2 py-1 text-xs">
                      {reachChannels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <textarea value={reachText} onChange={(e) => setReachText(e.target.value)} rows={2} placeholder={`Сообщение гостю на ${formatPhoneDisplay(b.guest.phone)}…`} className="w-full rounded-md border border-ink/20 px-2 py-1.5 text-sm" />
                  <p className="mt-1 text-[10px] leading-tight text-dark-gray">Гостю уходит первым по номеру телефона через выбранный канал. Личные аккаунты мессенджеров могут блокировать за рассылки — используйте официальные каналы.</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button type="button" onClick={() => void sendReach()} disabled={reachBusy || !reachText.trim() || !reachSaId} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-40">{reachBusy ? 'Отправка…' : 'Отправить'}</button>
                    {reachNote ? <span className={`text-[11px] ${reachNote.startsWith('Не удалось') || reachNote.includes('Ошибка') ? 'text-red-600' : 'text-emerald-600'}`}>{reachNote}</span> : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* История переписки с гостем (#12) */}
          {gid ? (
            <div className="mt-3 border-t border-ink/10 pt-2">
              <button type="button" onClick={toggleHistory} className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline">
                <span>💬 История переписки{threads ? ` · ${threads.length}` : ''}</span>
                <span>{showHistory ? '▲ свернуть' : '▼ развернуть'}</span>
              </button>
              {showHistory ? (
                threads === null ? (
                  <p className="mt-2 text-xs text-dark-gray">Загрузка…</p>
                ) : threads.length === 0 ? (
                  <p className="mt-2 text-xs text-dark-gray">Переписки с гостем пока нет.</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {threads.map((t) => {
                      const isOpen = openConvo === t.key;
                      const last = t.messages[t.messages.length - 1];
                      return (
                        <div key={t.key} className="rounded-lg border border-ink/10">
                          <button type="button" onClick={() => setOpenConvo(isOpen ? null : t.key)} className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-ink/[0.03]">
                            <span className="min-w-0">
                              <span className="text-xs text-ink">{threadLabel(t.channel, t.subChannel)}</span>
                              {last ? <span className="block truncate text-[11px] text-dark-gray">{last.role === 'user' ? '👤 ' : last.role === 'staff' ? '🧑‍💼 ' : '🤖 '}{last.text.replace(/\[img\]\S+/g, '📷 фото')}</span> : null}
                            </span>
                            <span className="shrink-0 text-[11px] text-dark-gray">{new Date(t.updatedAt).toLocaleDateString('ru')} {isOpen ? '▲' : '▼'}</span>
                          </button>
                          {isOpen ? (
                            <div className="max-h-64 space-y-1 overflow-y-auto border-t border-ink/10 px-2.5 py-1.5">
                              {t.messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                  <div className={`max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg px-2 py-1 text-[11px] ${m.role === 'user' ? 'bg-ink/[0.06] text-ink' : m.role === 'staff' ? 'bg-ink text-white' : 'border border-ink/10 text-dark-gray'}`}>
                                    {(() => {
                                      const img = m.text.match(/\[img\](\S+)/);
                                      const body = m.text.replace(/\[img\]\S+/g, '').trim();
                                      return (
                                        <>
                                          {body ? <span>{body}</span> : null}
                                          {img ? <a href={fileUrl(img[1])} target="_blank" rel="noreferrer" className={`${body ? 'ml-1 ' : ''}underline`}>📷 фото</a> : null}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Правки брони: даты, категория, тариф, номер. Смена тарифа — по праву pms_rates. */
function EditBookingSection({ b, rooms, act, busy, canRates }: { b: PmsBooking; rooms: PmsRoom[]; act: (fn: () => Promise<PmsBooking>) => void; busy: boolean; canRates: boolean }) {
  const [edit, setEdit] = useState(false);
  const [cats, setCats] = useState<RoomFundCategory[]>([]);
  const [plans, setPlans] = useState<PmsRatePlan[]>([]);
  const [checkIn, setCheckIn] = useState(b.checkIn.slice(0, 10));
  const [checkOut, setCheckOut] = useState(b.checkOut.slice(0, 10));
  const [roomTypeId, setRoomTypeId] = useState(b.roomType.id);
  const [ratePlanId, setRatePlanId] = useState('');
  const locked = ['CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].includes(b.status);
  useEffect(() => {
    void adminApi.roomFundCategories().then(setCats).catch(() => undefined);
    void adminApi.pmsRatePlans().then((p) => setPlans(p.filter((x) => x.active))).catch(() => undefined);
  }, []);
  useEffect(() => { setCheckIn(b.checkIn.slice(0, 10)); setCheckOut(b.checkOut.slice(0, 10)); setRoomTypeId(b.roomType.id); }, [b]);
  const catProp = cats.find((c) => c.id === b.roomType.id)?.propertyId;
  const plansFor = plans.filter((p) => p.propertyId === null || p.propertyId === catProp);
  const roomsOfCat = useMemo(() => rooms.filter((r) => r.roomType.id === roomTypeId).sort((a, c) => a.number.localeCompare(c.number, 'ru', { numeric: true })), [rooms, roomTypeId]);

  const saveEdits = () => {
    const body: { checkIn?: string; checkOut?: string; roomTypeId?: string; ratePlanId?: string } = {};
    if (checkIn !== b.checkIn.slice(0, 10)) body.checkIn = checkIn;
    if (checkOut !== b.checkOut.slice(0, 10)) body.checkOut = checkOut;
    if (roomTypeId !== b.roomType.id) body.roomTypeId = roomTypeId;
    if (canRates && ratePlanId) body.ratePlanId = ratePlanId;
    if (Object.keys(body).length === 0) { setEdit(false); return; }
    act(() => adminApi.pmsUpdateBooking(b.id, body)); setEdit(false);
  };

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Категория, тариф, номер</p>
        {!locked && !edit ? <button type="button" onClick={() => setEdit(true)} className="text-xs text-primary hover:underline">Изменить</button> : null}
      </div>
      {edit ? (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label>Заезд<div className="mt-0.5"><DatePicker value={checkIn} onChange={(v) => v && setCheckIn(v)} /></div></label>
            <label>Выезд<div className="mt-0.5"><DatePicker value={checkOut} min={checkIn} onChange={(v) => v && setCheckOut(v)} /></div></label>
          </div>
          <label className="block">Категория
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="mt-0.5 w-full rounded-md border border-ink/20 px-2 py-1.5">
              {cats.map((c) => <option key={c.id} value={c.id}>{c.property.name} · {c.name}</option>)}
            </select>
          </label>
          <label className="block">Тариф {canRates ? '' : '(нужно право «Тарифы»)'}
            <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} disabled={!canRates} className="mt-0.5 w-full rounded-md border border-ink/20 px-2 py-1.5 disabled:bg-ink/5">
              <option value="">— оставить «{b.ratePlanName}» —</option>
              {plansFor.map((p) => <option key={p.id} value={p.id}>{p.name}{p.availableBookingModule ? '' : ' · только стойка'}</option>)}
            </select>
          </label>
          <p className="text-xs text-dark-gray">Смена категории/тарифа/дат пересчитает доступность и цену (Rate Engine).</p>
          <div className="flex gap-2">
            <button type="button" onClick={saveEdits} disabled={busy} className="rounded-md bg-ink px-3 py-1.5 text-sm text-beige disabled:opacity-40">Сохранить</button>
            <button type="button" onClick={() => setEdit(false)} className="rounded-md border border-ink/20 px-3 py-1.5 text-sm">Отмена</button>
          </div>
        </div>
      ) : (
        <>
          <Row label="Период">{fmtDate(b.checkIn)} ({fmtDow(b.checkIn)}) — {fmtDate(b.checkOut)} ({fmtDow(b.checkOut)}) · {b.nights} ноч.</Row>
          <Row label="Категория">{b.roomType.name}</Row>
          <Row label="Тариф">{b.ratePlanName}</Row>
        </>
      )}
      <div className="mt-2 flex items-center gap-2">
        <select value={b.roomId ?? ''} onChange={(e) => act(() => adminApi.pmsUpdateBooking(b.id, { roomId: e.target.value || undefined }))} disabled={b.roomLocked || busy || locked} className="flex-1 rounded-md border border-ink/20 bg-white px-3 py-2 text-sm disabled:bg-ink/5">
          <option value="">Номер не назначен</option>
          {roomsOfCat.map((r) => <option key={r.id} value={r.id}>№{r.number}</option>)}
        </select>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={b.roomLocked} onChange={() => act(() => adminApi.pmsUpdateBooking(b.id, { roomLocked: !b.roomLocked }))} disabled={busy} /> Запретить переселение
      </label>
    </div>
  );
}

/** Теги брони: цветные маркеры (шахматка). Назначение + создание новых тегов из палитры (§6). */
function TagsSection({ b, onChanged }: { b: PmsBooking; onChanged: () => void }) {
  const [all, setAll] = useState<BookingTag[]>([]);
  const [selected, setSelected] = useState<string[]>(b.tags?.map((t) => t.id) ?? []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [busy, setBusy] = useState(false);
  const load = () => adminApi.pmsTags().then(setAll).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  useEffect(() => { setSelected(b.tags?.map((t) => t.id) ?? []); }, [b.id, b.tags]);

  const apply = async (next: string[]) => {
    setSelected(next); setBusy(true);
    try { await adminApi.pmsSetBookingTags(b.id, next); onChanged(); } catch { /* ignore */ } finally { setBusy(false); }
  };
  const toggle = (id: string) => apply(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const create = async () => {
    if (!name.trim()) return; setBusy(true);
    try { const t = await adminApi.pmsCreateTag({ name: name.trim(), color }); setName(''); setColor('blue'); setCreating(false); await load(); await apply([...selected, t.id]); } catch { /* ignore */ } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Теги</p>
        {!creating ? <button type="button" onClick={() => setCreating(true)} className="text-xs text-primary hover:underline">+ Новый тег</button> : null}
      </div>
      {all.length === 0 && !creating ? <p className="text-xs text-dark-gray">Тегов пока нет. Создайте первый — он появится маркером на шахматке.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button key={t.id} type="button" disabled={busy} onClick={() => toggle(t.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-transparent text-white' : 'border-ink/15 text-ink hover:bg-ink/5'}`}
              style={on ? { backgroundColor: tagHex(t.color) } : undefined}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : tagHex(t.color) }} />
              {t.name}
            </button>
          );
        })}
      </div>
      {creating ? (
        <div className="mt-3 space-y-2 rounded-lg border border-ink/10 bg-ink/[0.02] p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название тега (напр. VIP, Долг)" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <div className="flex items-center gap-2">
            {TAG_PALETTE.map((c) => (
              <button key={c.key} type="button" onClick={() => setColor(c.key)} title={c.label}
                className={`h-6 w-6 rounded-full ring-2 ring-offset-2 transition ${color === c.key ? 'ring-ink/40' : 'ring-transparent'}`} style={{ backgroundColor: c.hex }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={create} disabled={busy || !name.trim()} className="rounded-md bg-ink px-3 py-1.5 text-sm text-beige disabled:opacity-40">Создать и назначить</button>
            <button type="button" onClick={() => { setCreating(false); setName(''); }} className="rounded-md border border-ink/20 px-3 py-1.5 text-sm">Отмена</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Маркетинг брони: источник (read-only) + редактируемые словари (способ/откуда/скидка). */
function MarketingSection({ b, act, busy }: { b: PmsBooking; act: (fn: () => Promise<PmsBooking>) => void; busy: boolean }) {
  const [opts, setOpts] = useState<MarketingOption[]>([]);
  useEffect(() => { void adminApi.marketingOptions().then(setOpts).catch(() => undefined); }, []);
  const list = (k: MarketingKind) => opts.filter((o) => o.kind === k && o.active).map((o) => o.label);
  const Sel = ({ label, kind, value, field }: { label: string; kind: MarketingKind; value: string | null; field: 'bookingMethod' | 'referralSource' | 'discountReason' }) => (
    <label className="mb-2 block text-sm">
      <span className="mb-1 block text-xs text-dark-gray">{label}</span>
      <select value={value ?? ''} disabled={busy} onChange={(e) => act(() => adminApi.pmsUpdateBooking(b.id, { [field]: e.target.value }))} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
        <option value="">Не указано</option>
        {list(kind).map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </label>
  );
  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">Маркетинг</p>
      <Row label="Источник">{b.sourceName || b.channel}</Row>
      <div className="mt-2">
        <Sel label="Способ бронирования" kind="BOOKING_METHOD" value={b.bookingMethod} field="bookingMethod" />
        <Sel label="Откуда Вы о нас узнали?" kind="REFERRAL_SOURCE" value={b.referralSource} field="referralSource" />
        <Sel label="Обоснование скидки" kind="DISCOUNT_REASON" value={b.discountReason} field="discountReason" />
      </div>
    </div>
  );
}

/** Доп. информация с OTA/канала: комиссия, ID объекта, комментарий к платежу (эталон Bnovo). Сворачиваемая. */
function AdditionalInfoSection({ b }: { b: PmsBooking }) {
  const [open, setOpen] = useState(false);
  const has = b.otaCommission != null || b.externalObjectId || b.paymentComment || b.sourceName;
  if (!has) return null; // показываем только для OTA-броней (данные приходят из Channel Manager)
  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs uppercase tracking-wide text-dark-gray">Доп. информация (OTA / источник)</span>
        <span className="text-xs text-primary">{open ? 'Свернуть' : 'Развернуть'}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-1 text-sm">
          {b.sourceName ? <Row label="Источник">{b.sourceName}</Row> : null}
          {b.externalObjectId ? <Row label="ID объекта">{b.externalObjectId}</Row> : null}
          {b.otaCommission != null ? <Row label="Комиссия OTA">{money(b.otaCommission)}</Row> : null}
          <Row label="Стоимость проживания">{money(b.totalPrice)}</Row>
          <Row label="Оплачено онлайн">{money(paidAmount(b))}</Row>
          {b.paymentComment ? <div className="mt-1"><p className="text-xs text-dark-gray">Комментарий к платежу</p><p className="whitespace-pre-line text-ink">{b.paymentComment}</p></div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Модуль задач уборки/инженерии для номера брони (справа на «Основном»). */
function TasksModule({ b }: { b: PmsBooking }) {
  const [roomTasks, setRoomTasks] = useState<OpsTask[]>([]);
  const [text, setText] = useState('');
  const load = () => {
    if (!b.roomId) { setRoomTasks([]); return; }
    void adminApi.opsTasks({ roomId: b.roomId }).then((t) => setRoomTasks(t.filter((x) => !['DONE', 'CANCELLED'].includes(x.status)))).catch(() => undefined);
  };
  useEffect(load, [b.roomId, b.property.id]);
  const addHk = () => { if (!b.roomId) return; void adminApi.opsCreateTask({ kind: 'CLEANING', title: 'Уборка', roomId: b.roomId, description: text || undefined }).then(() => { setText(''); load(); }); };
  const addMnt = () => { if (!b.roomId) return; void adminApi.opsCreateTask({ kind: 'TASK', title: text || 'Инженерная заявка', roomId: b.roomId }).then(() => { setText(''); load(); }); };

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Задачи · уборка и инженерия</p>
      <p className="mb-2 text-[11px] leading-snug text-dark-gray">
        Ставьте задачи по номеру этой брони: <b>＋ Уборка</b> — горничной, <b>＋ Инженер</b> — инженерная заявка.
        Описание — по желанию. Ниже видны активные задачи по номеру; кнопки <b>«В работу» / «Готово»</b> меняют
        статус. Исполнители видят их в разделе «Задачи» и мобильном приложении.
      </p>
      {!b.roomId ? <p className="text-xs text-dark-gray">Назначьте номер, чтобы создавать задачи.</p> : (
        <>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Описание (необязательно)" className="mb-2 w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" />
          <div className="mb-3 flex gap-2">
            <button type="button" onClick={addHk} className="flex-1 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50">＋ Уборка</button>
            <button type="button" onClick={addMnt} className="flex-1 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50">＋ Инженер</button>
          </div>
          {roomTasks.length === 0 ? <p className="text-xs text-dark-gray">Задач нет.</p> : null}
          {roomTasks.map((t) => (
            <div key={t.id} className="mb-1 flex items-center justify-between gap-2 rounded-md bg-ink/5 px-3 py-1.5 text-xs">
              <span>{t.kind === 'CLEANING' ? '🧹' : '🔧'} {t.title} · {OPS_STATUS[t.status].label}</span>
              {['NEW', 'ACCEPTED', 'PAUSED'].includes(t.status) ? <button type="button" onClick={() => void adminApi.opsStatus(t.id, 'IN_PROGRESS').then(load)} className="shrink-0 text-primary underline">В работу</button>
                : t.status === 'IN_PROGRESS' ? <button type="button" onClick={() => void adminApi.opsStatus(t.id, 'DONE').then(load)} className="shrink-0 text-emerald-700 underline">Готово</button> : null}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Вкладка «Услуги»: доп-услуги брони с параметрами (количество/цена). */
function ServicesTab({ b, onChanged }: { b: PmsBooking; onChanged: () => void }) {
  const [catalog, setCatalog] = useState<Extra[]>([]);
  const [mode, setMode] = useState<'catalog' | 'custom'>('catalog');
  const [extraId, setExtraId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { void adminApi.extras().then((x) => setCatalog(x.filter((e) => e.active))).catch(() => undefined); }, []);

  const add = async () => {
    setBusy(true); setErr('');
    try {
      const q = Math.max(1, Number(qty) || 1);
      if (mode === 'catalog') {
        if (!extraId) { setErr('Выберите услугу'); return; }
        await adminApi.pmsAddBookingExtra(b.id, { extraId, qty: q });
      } else {
        if (!name.trim() || !price) { setErr('Укажите название и цену'); return; }
        await adminApi.pmsAddBookingExtra(b.id, { name: name.trim(), unitPrice: Number(price), qty: q });
      }
      setExtraId(''); setName(''); setPrice(''); setQty('1'); onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const remove = (lineId: string) => { setBusy(true); void adminApi.pmsRemoveBookingExtra(b.id, lineId).then(onChanged).catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка')).finally(() => setBusy(false)); };

  const rows = b.extras ?? [];
  return (
    <div className="max-w-2xl space-y-4">
      {/* Список позиций */}
      <div className="rounded-xl border border-ink/10">
        {rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-dark-gray">Доп-услуги к брони не добавлены.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-dark-gray"><th className="px-4 py-2 font-medium">Услуга</th><th className="px-2 py-2 text-right font-medium">Цена</th><th className="px-2 py-2 text-center font-medium">Кол-во</th><th className="px-2 py-2 text-right font-medium">Сумма</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-2 text-ink">{r.name}</td>
                  <td className="px-2 py-2 text-right text-dark-gray">{money(r.unitPrice)}</td>
                  <td className="px-2 py-2 text-center text-dark-gray">{r.qty}</td>
                  <td className="px-2 py-2 text-right font-medium text-ink">{money(r.total)}</td>
                  <td className="px-4 py-2 text-right"><button type="button" onClick={() => remove(r.id)} disabled={busy} className="text-ink/40 hover:text-red-600" title="Удалить">×</button></td>
                </tr>
              ))}
              <tr className="bg-ink/[0.03]"><td className="px-4 py-2 font-medium text-ink" colSpan={3}>Итого доп-услуги</td><td className="px-2 py-2 text-right font-medium text-ink">{money(b.extrasTotal)}</td><td /></tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Добавить услугу */}
      <div className="rounded-xl border border-dashed border-ink/25 p-4">
        <div className="mb-3 flex gap-2 text-sm">
          <button type="button" onClick={() => setMode('catalog')} className={`rounded-md px-3 py-1.5 ${mode === 'catalog' ? 'bg-ink text-beige' : 'border border-ink/20 text-ink'}`}>Из каталога</button>
          <button type="button" onClick={() => setMode('custom')} className={`rounded-md px-3 py-1.5 ${mode === 'custom' ? 'bg-ink text-beige' : 'border border-ink/20 text-ink'}`}>Произвольная</button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {mode === 'catalog' ? (
            <label className="min-w-[220px] flex-1 text-sm">
              <span className="mb-1 block text-xs text-dark-gray">Услуга</span>
              <select value={extraId} onChange={(e) => setExtraId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                <option value="">Выберите…</option>
                {catalog.map((e) => <option key={e.id} value={e.id}>{e.name} — {money(e.price)}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="min-w-[160px] flex-1 text-sm"><span className="mb-1 block text-xs text-dark-gray">Название</span><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" /></label>
              <label className="w-28 text-sm"><span className="mb-1 block text-xs text-dark-gray">Цена, ₽</span><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" /></label>
            </>
          )}
          <label className="w-20 text-sm"><span className="mb-1 block text-xs text-dark-gray">Кол-во</span><input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" /></label>
          <button type="button" onClick={add} disabled={busy} className="rounded-md bg-ink px-4 py-2 text-sm text-beige disabled:opacity-40">Добавить</button>
        </div>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
      </div>
    </div>
  );
}

/** ÐÐºÐ»Ð°Ð´ÐºÐ° Â«ÐÑÑÐ½Ð°Ð»Â»: Ð¶ÑÑÐ½Ð°Ð» Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ð¹ Ð±ÑÐ¾Ð½Ð¸ (Ð°ÑÐ´Ð¸Ñ Â§5). */
function JournalTab({ bookingId }: { bookingId: string }) {
  const [rows, setRows] = useState<BookingAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); void adminApi.pmsBookingAudit(bookingId).then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, [bookingId]);
  if (loading) return <p className="text-sm text-dark-gray">Загрузка…</p>;
  if (rows.length === 0) return <p className="text-sm text-dark-gray">Изменений пока нет.</p>;
  return (
    <div className="max-w-2xl">
      <ol className="relative border-l border-ink/15 pl-5">
        {rows.map((r) => (
          <li key={r.id} className="relative mb-4">
            <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-white" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{AUDIT_LABEL[r.action] ?? r.action}</span>
              <span className="text-xs text-dark-gray">{new Date(r.at).toLocaleString('ru-RU')}</span>
            </div>
            <p className="text-xs text-dark-gray">{r.actor}{auditSummary(r) ? ` · ${auditSummary(r)}` : ''}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
const AUDIT_LABEL: Record<string, string> = {
  created: 'Бронь создана', updated: 'Бронь изменена', cancelled: 'Бронь отменена',
  checked_in: 'Заселение', checked_out: 'Выезд', checkin_reverted: 'Возврат заселения',
  checkout_reopened: 'Открыта после выезда', no_show: 'Неявка',
  extra_added: 'Добавлена услуга', extra_removed: 'Удалена услуга',
  doc_created: 'Создан документ', doc_cancelled: 'Документ аннулирован',
  deposit_held: 'Залог оформлен', deposit_release: 'Залог снят', deposit_capture: 'Залог удержан', deposit_refund: 'Залог возвращён',
};
function auditSummary(r: BookingAuditEntry): string {
  const p = r.payload; if (!p) return '';
  const parts: string[] = [];
  if (typeof p.number === 'string') parts.push(p.number);
  if (typeof p.docType === 'string') parts.push(String(p.docType));
  if (typeof p.amount === 'number') parts.push(`${p.amount.toLocaleString('ru')} ₽`);
  if (typeof p.reason === 'string') parts.push(p.reason);
  if (p.roomId !== undefined || p.roomTypeId !== undefined) parts.push('перемещение');
  return parts.join(' · ');
}


function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mb-1 flex justify-between gap-3 text-sm"><span className="shrink-0 text-dark-gray">{label}</span><span className="text-right text-ink">{children}</span></div>;
}
function FinRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between py-0.5 text-sm ${strong ? 'font-medium text-ink' : 'text-dark-gray'}`}><span>{label}</span><span className="text-ink">{value}</span></div>;
}
