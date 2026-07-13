'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type PmsBooking, type PmsRoom, type PmsRoomOption } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';
import { BookingCreateModal } from '../shakhmatka/BookingCreateModal';
import { BookingWindow } from '../shakhmatka/BookingWindow';
import { statusMeta } from '../shakhmatka/booking-view';
import { formatPhoneDisplay } from '../../../lib/phone';
import { tagHex } from '../../../lib/tags';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const day = (s: string) => new Date(s).toLocaleDateString('ru-RU');
const guestName = (b: PmsBooking) => `${b.guest?.lastName ?? ''} ${b.guest?.firstName ?? ''}`.trim() || 'Гость';

// Чипы-статистика (эталон Bnovo).
const CHIPS: { key: string; label: string; dot: string; match: (b: PmsBooking) => boolean }[] = [
  { key: '', label: 'Все', dot: 'bg-ink/40', match: () => true },
  { key: 'PENDING', label: 'Новые', dot: 'bg-emerald-500', match: (b) => b.status === 'PENDING' },
  { key: 'CONFIRMED', label: 'Проверенные', dot: 'bg-amber-400', match: (b) => b.status === 'CONFIRMED' },
  { key: 'CHECKED_IN', label: 'Проживающие', dot: 'bg-sky-500', match: (b) => b.status === 'CHECKED_IN' },
  { key: 'CHECKED_OUT', label: 'Выехали', dot: 'bg-slate-400', match: (b) => b.status === 'CHECKED_OUT' },
  { key: 'CANCELLED', label: 'Отменённые', dot: 'bg-rose-500', match: (b) => b.status === 'CANCELLED' },
];

interface AdvFilter {
  roomType: string; ratePlan: string; tagId: string;
  checkInFrom: string; checkInTo: string; checkOutFrom: string; checkOutTo: string;
  createdFrom: string; createdTo: string;
  guest: string; phone: string; email: string; unassignedOnly: boolean;
}
const emptyAdv = (): AdvFilter => ({ roomType: '', ratePlan: '', tagId: '', checkInFrom: '', checkInTo: '', checkOutFrom: '', checkOutTo: '', createdFrom: '', createdTo: '', guest: '', phone: '', email: '', unassignedOnly: false });

export default function PmsBookingsPage() {
  const ready = useRequireAdmin();
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [bookings, setBookings] = useState<PmsBooking[]>([]);
  const [chip, setChip] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [openBooking, setOpenBooking] = useState<PmsBooking | null>(null);

  // Расширенный фильтр (§5)
  const [advOpen, setAdvOpen] = useState(false);
  const [adv, setAdv] = useState<AdvFilter>(emptyAdv());

  const load = () => adminApi.pmsBookings(filterProperty ? { propertyId: filterProperty } : {}).then(setBookings).catch(() => undefined);
  // Префилл поиска из URL (?q=…) — переход из интеллектуального поиска в сайдбаре.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('q');
    if (p) setSearch(p);
  }, []);
  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
    void adminApi.pmsRooms().then(setRooms).catch(() => undefined);
  }, [ready]);
  useEffect(() => { if (ready) void load(); }, [ready, filterProperty]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of CHIPS) m[c.key] = bookings.filter(c.match).length;
    return m;
  }, [bookings]);

  // Уникальные категории/тарифы/теги из загруженных броней — для селектов расширенного фильтра.
  const catOptions = useMemo(() => [...new Set(bookings.map((b) => b.roomType.name))].sort(), [bookings]);
  const planOptions = useMemo(() => [...new Set(bookings.map((b) => b.ratePlanName))].sort(), [bookings]);
  const tagOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bookings) for (const t of b.tags ?? []) m.set(t.id, t.name);
    return [...m.entries()];
  }, [bookings]);
  const advActive = useMemo(() => Object.values(adv).filter(Boolean).length, [adv]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const chipDef = CHIPS.find((c) => c.key === chip) ?? CHIPS[0]!;
    const day10 = (s: string) => s.slice(0, 10);
    return bookings
      .filter(chipDef.match)
      .filter((b) => !q || guestName(b).toLowerCase().includes(q) || (b.bookingNumber ?? '').toLowerCase().includes(q) || (b.guest?.phone ?? '').includes(q))
      // Расширенный фильтр
      .filter((b) => !adv.roomType || b.roomType.name === adv.roomType)
      .filter((b) => !adv.ratePlan || b.ratePlanName === adv.ratePlan)
      .filter((b) => !adv.tagId || (b.tags ?? []).some((t) => t.id === adv.tagId))
      .filter((b) => !adv.checkInFrom || day10(b.checkIn) >= adv.checkInFrom)
      .filter((b) => !adv.checkInTo || day10(b.checkIn) <= adv.checkInTo)
      .filter((b) => !adv.checkOutFrom || day10(b.checkOut) >= adv.checkOutFrom)
      .filter((b) => !adv.checkOutTo || day10(b.checkOut) <= adv.checkOutTo)
      .filter((b) => !adv.createdFrom || day10(b.createdAt) >= adv.createdFrom)
      .filter((b) => !adv.createdTo || day10(b.createdAt) <= adv.createdTo)
      .filter((b) => !adv.guest || guestName(b).toLowerCase().includes(adv.guest.toLowerCase()))
      .filter((b) => !adv.phone || (b.guest?.phone ?? '').replace(/\D/g, '').includes(adv.phone.replace(/\D/g, '')))
      .filter((b) => !adv.email || (b.guest?.email ?? '').toLowerCase().includes(adv.email.toLowerCase()))
      .filter((b) => !adv.unassignedOnly || !b.room)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [bookings, chip, search, adv]);

  const totalSum = useMemo(() => shown.reduce((s, b) => s + b.totalPrice + b.extrasTotal, 0), [shown]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-light text-ink">Бронирования</h1>
        <Button onClick={() => setCreating(true)}>＋ Добавить бронирование</Button>
      </div>

      {/* Чипы-статистика */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button key={c.key} type="button" onClick={() => setChip(c.key)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${chip === c.key ? 'border-primary bg-primary-50 font-medium text-primary-700' : 'border-ink/10 text-ink hover:bg-ink/[0.03]'}`}>
            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
            {c.label}<span className="font-semibold">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Поиск + фильтры */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Введите фамилию, номер брони или телефон" className={`${selectCls} min-w-[280px] flex-1`} />
        <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)} className={selectCls}>
          <option value="">Все объекты</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" onClick={() => setAdvOpen(true)} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${advActive ? 'border-primary bg-primary-50 text-primary-700' : 'border-ink/20 text-ink hover:bg-ink/[0.03]'}`}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Расширенный фильтр{advActive ? ` · ${advActive}` : ''}
        </button>
        {advActive ? <button type="button" onClick={() => setAdv(emptyAdv())} className="text-sm text-primary hover:underline">Сбросить</button> : null}
      </div>
      <p className="mb-3 text-sm text-dark-gray"><span className="font-semibold text-ink">{shown.length} бронирований</span> · {rub(totalSum)}</p>

      {/* Таблица */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-ink/[0.02] text-left text-xs uppercase tracking-wide text-dark-gray">
              <th className="px-4 py-3 font-medium">Дата брони</th>
              <th className="px-3 py-3 font-medium">Период проживания</th>
              <th className="px-3 py-3 font-medium">Тариф</th>
              <th className="px-3 py-3 font-medium">Категория</th>
              <th className="px-3 py-3 font-medium">Номер</th>
              <th className="px-3 py-3 font-medium">Заказчик</th>
              <th className="px-3 py-3 font-medium">Телефон</th>
              <th className="px-3 py-3 text-center font-medium">Взр/Реб</th>
              <th className="px-3 py-3 font-medium">Статус</th>
              <th className="px-3 py-3 text-right font-medium">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-dark-gray">Броней нет.</td></tr> : null}
            {shown.map((b) => {
              const sm = statusMeta(b.status);
              return (
                <tr key={b.id} onClick={() => setOpenBooking(b)} className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-primary-50/40">
                  <td className="px-4 py-2.5 text-dark-gray">{day(b.createdAt)}</td>
                  <td className="px-3 py-2.5 text-ink">{day(b.checkIn)} – {day(b.checkOut)}<span className="text-dark-gray"> · {b.nights} ноч.</span></td>
                  <td className="px-3 py-2.5 text-dark-gray">{b.ratePlanName}</td>
                  <td className="px-3 py-2.5 text-ink">{b.property.name} · {b.roomType.name}</td>
                  <td className="px-3 py-2.5">{b.room ? `№${b.room.number}` : <span className="text-amber-600">не распр.</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-medium text-primary">{guestName(b)}</span>
                      {b.tags?.length ? b.tags.slice(0, 3).map((t) => <span key={t.id} title={t.name} className="h-2 w-2 rounded-full" style={{ backgroundColor: tagHex(t.color) }} />) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-dark-gray">{b.guest?.phone ? formatPhoneDisplay(b.guest.phone) : '—'}</td>
                  <td className="px-3 py-2.5 text-center text-dark-gray">{b.adults ?? b.guests}/{b.children ?? 0}</td>
                  <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${sm.badge}`}>{sm.label}</span></td>
                  <td className="px-3 py-2.5 text-right font-medium text-ink">{rub(b.totalPrice + b.extrasTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {advOpen ? (
        <AdvancedFilterPanel
          adv={adv} setAdv={setAdv}
          catOptions={catOptions} planOptions={planOptions} tagOptions={tagOptions}
          onClose={() => setAdvOpen(false)} onReset={() => setAdv(emptyAdv())}
          count={shown.length}
        />
      ) : null}
      {creating ? <BookingCreateModal options={options} rooms={rooms} onClose={() => setCreating(false)} onCreated={load} /> : null}
      {openBooking ? <BookingWindow booking={openBooking} rooms={rooms} onClose={() => setOpenBooking(null)} onChanged={load} /> : null}
    </main>
  );
}

/** Расширенный фильтр броней — выезжающая панель справа (эталон Bnovo). Фильтрация клиентская. */
function AdvancedFilterPanel({ adv, setAdv, catOptions, planOptions, tagOptions, onClose, onReset, count }: {
  adv: AdvFilter; setAdv: (a: AdvFilter) => void;
  catOptions: string[]; planOptions: string[]; tagOptions: [string, string][];
  onClose: () => void; onReset: () => void; count: number;
}) {
  const set = (patch: Partial<AdvFilter>) => setAdv({ ...adv, ...patch });
  const fc = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
  const lbl = 'mb-1 block text-xs font-medium text-dark-gray';
  const Dates = ({ label, from, to, fromKey, toKey }: { label: string; from: string; to: string; fromKey: keyof AdvFilter; toKey: keyof AdvFilter }) => (
    <div>
      <label className={lbl}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="date" value={from} onChange={(e) => set({ [fromKey]: e.target.value } as Partial<AdvFilter>)} className={fc} />
        <span className="text-xs text-dark-gray">по</span>
        <input type="date" value={to} onChange={(e) => set({ [toKey]: e.target.value } as Partial<AdvFilter>)} className={fc} />
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4">
          <h2 className="text-lg font-medium text-ink">Расширенный фильтр</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className={lbl}>Категория</label>
            <select value={adv.roomType} onChange={(e) => set({ roomType: e.target.value })} className={fc}>
              <option value="">Все категории</option>
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Тариф</label>
            <select value={adv.ratePlan} onChange={(e) => set({ ratePlan: e.target.value })} className={fc}>
              <option value="">Все тарифы</option>
              {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Тег</label>
            <select value={adv.tagId} onChange={(e) => set({ tagId: e.target.value })} className={fc}>
              <option value="">Любой</option>
              {tagOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <Dates label="Дата заезда" from={adv.checkInFrom} to={adv.checkInTo} fromKey="checkInFrom" toKey="checkInTo" />
          <Dates label="Дата выезда" from={adv.checkOutFrom} to={adv.checkOutTo} fromKey="checkOutFrom" toKey="checkOutTo" />
          <Dates label="Дата брони" from={adv.createdFrom} to={adv.createdTo} fromKey="createdFrom" toKey="createdTo" />
          <div className="border-t border-ink/10 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-gray">Гость</p>
            <div className="space-y-2">
              <div><label className={lbl}>Фамилия / имя</label><input value={adv.guest} onChange={(e) => set({ guest: e.target.value })} className={fc} /></div>
              <div><label className={lbl}>Телефон</label><input value={adv.phone} onChange={(e) => set({ phone: e.target.value })} className={fc} /></div>
              <div><label className={lbl}>Email</label><input value={adv.email} onChange={(e) => set({ email: e.target.value })} className={fc} /></div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={adv.unassignedOnly} onChange={(e) => set({ unassignedOnly: e.target.checked })} /> Только без назначенного номера</label>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-ink/10 bg-white px-5 py-3">
          <button type="button" onClick={onReset} className="text-sm text-primary hover:underline">Сбросить фильтры</button>
          <Button onClick={onClose}>Показать {count}</Button>
        </div>
      </div>
    </div>
  );
}
