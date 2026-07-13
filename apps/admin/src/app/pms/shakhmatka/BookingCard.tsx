'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { adminApi, type OpsTask, type PmsBooking, type PmsRoom } from '../../../lib/api';
import { STATUS as OPS_STATUS } from '../../ops/shared';
import { balanceBadge, guestName, money, paidAmount, statusMeta } from './booking-view';
import { useEsc } from '../../../lib/use-esc';
import { formatPhoneDisplay } from '../../../lib/phone';

const fmtDate = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('ru-RU'); };
const fmtDow = (iso: string) => { const w = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay()]; return w; };

/** Карточка брони — правая выезжающая панель (эталон Bnovo). Статусы, гости, тариф, финансы, задачи, примечание, запрет переселения. */
export function BookingCard({ booking, rooms, onClose, onChanged, onOpenFull }: {
  booking: PmsBooking; rooms: PmsRoom[]; onClose: () => void; onChanged: () => void; onOpenFull?: (b: PmsBooking) => void;
}) {
  useEsc(onClose);
  const [b, setB] = useState<PmsBooking>(booking);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState(booking.comment ?? '');
  const [roomTasks, setRoomTasks] = useState<OpsTask[]>([]);
  const [taskText, setTaskText] = useState('');

  useEffect(() => { setB(booking); setNote(booking.comment ?? ''); }, [booking]);

  const roomsOfCat = useMemo(() => rooms.filter((r) => r.roomType.id === b.roomType.id).sort((a, c) => a.number.localeCompare(c.number, 'ru', { numeric: true })), [rooms, b.roomType.id]);
  const sm = statusMeta(b.status);
  const total = b.totalPrice + b.extrasTotal;
  const paid = paidAmount(b);
  const bal = balanceBadge(b, new Date().toISOString().slice(0, 10));

  const loadTasks = () => {
    if (!b.roomId) { setRoomTasks([]); return; }
    void adminApi.opsTasks({ roomId: b.roomId }).then((t) => setRoomTasks(t.filter((x) => !['DONE', 'CANCELLED'].includes(x.status)))).catch(() => undefined);
  };
  useEffect(loadTasks, [b.roomId, b.property.id]);

  const act = async (fn: () => Promise<PmsBooking>) => {
    setBusy(true); setErr('');
    try { const upd = await fn(); setB(upd); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const setStatus = (target: 'PENDING' | 'CONFIRMED') => act(() => adminApi.pmsUpdateBooking(b.id, { status: target }));
  const checkIn = () => act(() => adminApi.pmsCheckIn(b.id));
  const revertCheckIn = () => act(() => adminApi.pmsRevertCheckIn(b.id));
  const checkOut = () => act(() => adminApi.pmsCheckOut(b.id));
  const cancel = () => { if (confirm('Отменить бронь?')) void act(() => adminApi.pmsCancelBooking(b.id, 'Отменена вручную')); };
  const reassign = (roomId: string) => act(() => adminApi.pmsUpdateBooking(b.id, { roomId: roomId || undefined }));
  const toggleLock = () => act(() => adminApi.pmsUpdateBooking(b.id, { roomLocked: !b.roomLocked }));
  const saveNote = () => act(() => adminApi.pmsUpdateBooking(b.id, { comment: note }));

  const createHk = () => { if (!b.roomId) return; void adminApi.opsCreateTask({ kind: 'CLEANING', title: 'Уборка', roomId: b.roomId, description: taskText || undefined }).then(() => { setTaskText(''); loadTasks(); }); };
  const createMnt = () => { if (!b.roomId) return; void adminApi.opsCreateTask({ kind: 'TASK', title: taskText || 'Инженерная заявка', roomId: b.roomId }).then(() => { setTaskText(''); loadTasks(); }); };

  const StatusBtn = ({ label, active, activeCls, onClick, disabled }: { label: string; active: boolean; activeCls: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={`rounded-md px-3 py-1.5 text-sm transition disabled:opacity-40 ${active ? `${activeCls} text-white` : 'border border-ink/20 text-ink hover:bg-ink/5'}`}>{label}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4">
          <h2 className="text-xl font-light text-ink">{guestName(b)}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>

        <div className="space-y-5 px-5 py-4 text-sm">
          {/* Номер и дата брони — клик по номеру открывает полное окно брони */}
          <Row label="Номер и дата брони">
            {onOpenFull ? (
              <button type="button" onClick={() => onOpenFull(b)} className="font-medium text-primary underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600" title="Открыть окно бронирования">
                {b.bookingNumber ?? '—'}
              </button>
            ) : <span className="text-ink">{b.bookingNumber ?? '—'}</span>}
            <span className="ml-2 text-dark-gray">{fmtDate(b.createdAt)}</span>
          </Row>

          {/* Статус */}
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">Статус</p>
            <div className="flex flex-wrap gap-2">
              <StatusBtn label="Новое" activeCls="bg-emerald-500" active={b.status === 'PENDING'} onClick={() => setStatus('PENDING')} disabled={!['PENDING', 'CONFIRMED'].includes(b.status)} />
              <StatusBtn label="Проверено" activeCls="bg-amber-400" active={b.status === 'CONFIRMED'} onClick={() => (b.status === 'CHECKED_IN' ? revertCheckIn() : setStatus('CONFIRMED'))} disabled={!['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(b.status)} />
              <StatusBtn label="Заселён" activeCls="bg-sky-500" active={b.status === 'CHECKED_IN'} onClick={checkIn} disabled={b.status !== 'CONFIRMED'} />
              {b.status === 'CHECKED_IN' || b.status === 'CHECKED_OUT' ? <StatusBtn label="Выехал" activeCls="bg-slate-500" active={b.status === 'CHECKED_OUT'} onClick={checkOut} disabled={b.status === 'CHECKED_OUT'} /> : null}
              <StatusBtn label="Отменён" activeCls="bg-rose-500" active={b.status === 'CANCELLED'} onClick={cancel} disabled={['CHECKED_OUT', 'CANCELLED'].includes(b.status)} />
              <span className={`ml-auto self-center rounded-full px-2.5 py-1 text-xs ${sm.badge}`}>{sm.label}</span>
            </div>
          </div>

          <Row label="Источник">{b.channel}</Row>

          {/* Период проживания */}
          <div className="border-t border-ink/10 pt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">Период проживания</p>
            <p className="text-ink">{fmtDate(b.checkIn)} ({fmtDow(b.checkIn)}) {b.arrivalTime ?? ''} — {fmtDate(b.checkOut)} ({fmtDow(b.checkOut)}) {b.departureTime ?? ''} <span className="text-dark-gray">· {b.nights} ноч.</span></p>
          </div>

          {/* Заказчик и гости */}
          <div className="border-t border-ink/10 pt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">Заказчик и гости</p>
            <Row label="Заказчик">{guestName(b)}</Row>
            {b.guest?.phone ? <Row label="Телефон"><a href={`tel:${b.guest.phone}`} className="text-ink">{formatPhoneDisplay(b.guest.phone)}</a></Row> : null}
            {b.guest?.email ? <Row label="Почта"><a href={`mailto:${b.guest.email}`} className="text-ink">{b.guest.email}</a></Row> : null}
            <Row label="Взрослые и дети">{(b.adults ?? b.guests)} взр{b.children ? ` · ${b.children} дет` : ''}</Row>
          </div>

          {/* Категория, тариф, номер + запрет переселения */}
          <div className="border-t border-ink/10 pt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">Категория и тариф</p>
            <Row label="Категория">{b.roomType.name}</Row>
            <Row label="Тариф">{b.ratePlanName}</Row>
            <div className="mt-2">
              <label className="mb-1 block text-xs text-dark-gray">Номер</label>
              <div className="flex items-center gap-2">
                <select value={b.roomId ?? ''} onChange={(e) => reassign(e.target.value)} disabled={b.roomLocked || busy} className="flex-1 rounded-md border border-ink/20 bg-white px-3 py-2 text-sm disabled:bg-ink/5">
                  <option value="">Не назначен</option>
                  {roomsOfCat.map((r) => <option key={r.id} value={r.id}>№{r.number}</option>)}
                </select>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={b.roomLocked} onChange={toggleLock} disabled={busy} /> Запретить переселение (номер зафиксирован)
              </label>
            </div>
          </div>

          {/* Примечание гостя */}
          <div className="border-t border-ink/10 pt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">Примечание гостя</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" placeholder="Пожелания гостя, комментарий…" />
            {note !== (b.comment ?? '') ? <button type="button" onClick={saveNote} disabled={busy} className="mt-1 text-xs text-primary underline">Сохранить примечание</button> : null}
          </div>

          {/* Задачи HK / инженерия */}
          <div className="border-t border-ink/10 pt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">Задачи · уборка и инженерия</p>
            {!b.roomId ? <p className="text-xs text-dark-gray">Назначьте номер, чтобы создавать задачи.</p> : (
              <>
                <input value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="Описание задачи (необязательно)" className="mb-2 w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" />
                <div className="mb-3 flex gap-2">
                  <button type="button" onClick={createHk} className="rounded-md border border-dashed border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50">＋ Уборка</button>
                  <button type="button" onClick={createMnt} className="rounded-md border border-dashed border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50">＋ Инженерная заявка</button>
                </div>
                {roomTasks.map((t) => (
                  <div key={t.id} className="mb-1 flex items-center justify-between gap-2 rounded-md bg-ink/5 px-3 py-1.5 text-xs">
                    <span>{t.kind === 'CLEANING' ? '🧹' : '🔧'} {t.title} · {OPS_STATUS[t.status].label}</span>
                    {['NEW', 'ACCEPTED', 'PAUSED'].includes(t.status) ? <button type="button" onClick={() => void adminApi.opsStatus(t.id, 'IN_PROGRESS').then(loadTasks)} className="text-primary underline">В работу</button>
                      : t.status === 'IN_PROGRESS' ? <button type="button" onClick={() => void adminApi.opsStatus(t.id, 'DONE').then(loadTasks)} className="text-emerald-700 underline">Готово</button> : null}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Финансы */}
          <div className="border-t border-ink/10 pt-4">
            <FinRow label="Проживание" value={money(b.totalPrice)} />
            <FinRow label="Доп. услуги" value={money(b.extrasTotal)} />
            <FinRow label="Итого" value={money(total)} strong />
            <FinRow label="Оплачено" value={money(paid)} />
            <FinRow label="Остаток к оплате" value={money(Math.max(0, total - paid))} />
            {bal ? <div className="mt-2 flex justify-between"><span className="text-dark-gray">Баланс клиента</span><span className={bal.kind === 'green' ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>{bal.kind === 'green' ? '+' : '−'}{money(bal.amount)}</span></div> : null}
          </div>

          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mb-1 flex justify-between gap-3"><span className="shrink-0 text-dark-gray">{label}</span><span className="text-right text-ink">{children}</span></div>;
}
function FinRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between py-0.5 ${strong ? 'font-medium text-ink' : 'text-dark-gray'}`}><span>{label}</span><span className={strong ? 'text-ink' : 'text-ink'}>{value}</span></div>;
}
