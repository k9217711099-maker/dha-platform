'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@dha/ui';
import { adminApi, type Extra, type GuestDetails, type GuestSearchResult, type MarketingKind, type MarketingOption, type PmsAvailabilityRow, type PmsRatePlan, type PmsRoom, type PmsRoomOption, type RoomFundCategory } from '../../../lib/api';
import { useEsc } from '../../../lib/use-esc';
import { PhoneInput } from '../../../components/PhoneInput';
import { DatePicker } from '../../../components/DatePicker';
import { normalizePhone } from '../../../lib/phone';
import { tierMeta } from '../../../lib/loyalty';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-xs font-medium text-dark-gray';

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'MANAGER', label: 'Менеджер' },
  { value: 'PHONE', label: 'Телефон' },
  { value: 'MESSENGER', label: 'Мессенджер' },
  { value: 'WEBSITE', label: 'Сайт' },
  { value: 'MOBILE_APP', label: 'Приложение' },
  { value: 'OTA', label: 'OTA / канал' },
];
const BLOCK_REASONS: { value: string; label: string; type: string }[] = [
  { value: 'unavailable', label: 'Недоступен', type: 'OUT_OF_ORDER' },
  { value: 'repair', label: 'Ремонт', type: 'MAINTENANCE' },
  { value: 'quota', label: 'Квота', type: 'OWNER' },
];

export interface BookingPrefill {
  propertyId?: string;
  roomTypeId?: string;
  roomId?: string;
  checkIn?: string;
  checkOut?: string;
}

interface SegExtra { extraId: string; name: string; unitPrice: number; qty: number }
interface Segment {
  roomTypeId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  arrivalTime: string;
  departureTime: string;
  adults: number;
  children: number;
  ratePlanId: string; // '' — ручная цена
  totalPrice: string;
  extras: SegExtra[]; // доп-услуги, привязанные к этой брони
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
function nightsOf(a: string, b: string): number {
  const d = Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
  return d > 0 ? d : 0;
}
const capOf = (c: RoomFundCategory | undefined) => (c ? (c.mainPlaces ?? c.capacity) + c.extraPlaces : 99);
const rangeKey = (a: string, b: string) => `${a}|${b}`;

/** Создание брони (вкл. мульти-номер) и закрытие продажи. Категории — единым списком сети (без переключения объектов). */
export function BookingCreateModal({ rooms, prefill, onClose, onCreated }: {
  options: PmsRoomOption[];
  rooms: PmsRoom[];
  prefill?: BookingPrefill;
  onClose: () => void;
  onCreated: () => void;
}) {
  useEsc(onClose);
  const [tab, setTab] = useState<'booking' | 'block'>('booking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<RoomFundCategory[]>([]);
  const [allPlans, setAllPlans] = useState<PmsRatePlan[]>([]);
  const [avail, setAvail] = useState<Record<string, Record<string, { available: number; capacity: number }>>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [marketing, setMarketing] = useState<MarketingOption[]>([]);
  const [quotes, setQuotes] = useState<Record<number, number | 'loading' | null>>({});
  const mkOpts = (k: MarketingKind) => marketing.filter((o) => o.kind === k && o.active).map((o) => o.label);

  const catsSorted = useMemo(() => [...categories].sort((a, b) => (a.property.name + a.name).localeCompare(b.property.name + b.name, 'ru')), [categories]);
  const catById = (id: string) => categories.find((c) => c.id === id);
  const roomsOf = (rtId: string) => rooms.filter((r) => r.roomType.id === rtId).sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }));
  const availFor = (rtId: string, checkIn: string, checkOut: string) => avail[rangeKey(checkIn, checkOut)]?.[rtId];

  // ─── Данные ───
  useEffect(() => {
    void adminApi.roomFundCategories().then(setCategories).catch(() => setCategories([]));
    void adminApi.pmsRatePlans().then((pl) => setAllPlans(pl.filter((p) => p.active))).catch(() => setAllPlans([]));
    void adminApi.extras().then(setExtras).catch(() => setExtras([]));
    void adminApi.marketingOptions().then(setMarketing).catch(() => setMarketing([]));
  }, []);
  // Тарифы, применимые к категории: сетевые (propertyId=null) + тарифы объекта категории.
  const plansFor = (rtId: string) => { const pid = propertyIdOf(rtId); return allPlans.filter((p) => p.propertyId === null || p.propertyId === pid); };

  const initCheckIn = prefill?.checkIn ?? todayIso();
  const [segments, setSegments] = useState<Segment[]>([{
    roomTypeId: prefill?.roomTypeId ?? '',
    roomId: prefill?.roomId ?? '',
    checkIn: initCheckIn,
    checkOut: prefill?.checkOut ?? plusDays(initCheckIn, 1),
    arrivalTime: '14:00', departureTime: '12:00',
    adults: 2, children: 0, ratePlanId: '', totalPrice: '', extras: [],
  }]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [guestId, setGuestId] = useState('');
  const [guestQuery, setGuestQuery] = useState('');
  const [guestResults, setGuestResults] = useState<GuestSearchResult[]>([]);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestInfo, setGuestInfo] = useState<GuestDetails | null>(null);
  const [guestNotes, setGuestNotes] = useState('');        // примечание, закреплённое за гостем (§3)
  const [guestNotesBase, setGuestNotesBase] = useState(''); // исходное значение (для отслеживания правок)
  const [source, setSource] = useState('MANAGER');
  const [comment, setComment] = useState('');
  const [bookingMethod, setBookingMethod] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // ─── Закрытие продажи ───
  const [blkRoomTypeId, setBlkRoomTypeId] = useState(prefill?.roomTypeId ?? '');
  const [blkRoomIds, setBlkRoomIds] = useState<Set<string>>(new Set());
  const [blkFrom, setBlkFrom] = useState(initCheckIn);
  const [blkTo, setBlkTo] = useState(plusDays(initCheckIn, 1));
  const [blkReason, setBlkReason] = useState('unavailable');
  const [blkComment, setBlkComment] = useState('');

  const propertyIdOf = (rtId: string) => catById(rtId)?.propertyId ?? '';

  // Автоподстановка гостя из базы: поиск по мере ввода (телефон/имя/email).
  useEffect(() => {
    const q = guestQuery.trim();
    if (guestId || q.length < 2) { setGuestResults([]); return; }
    const t = setTimeout(() => { void adminApi.searchGuests(q).then(setGuestResults).catch(() => setGuestResults([])); }, 250);
    return () => clearTimeout(t);
  }, [guestQuery, guestId]);

  const pickGuest = (g: GuestSearchResult) => {
    setGuestId(g.id);
    setFirstName(g.firstName ?? ''); setLastName(g.lastName ?? '');
    setPhone(g.phone ?? ''); setEmail(g.email ?? '');
    setGuestQuery(`${g.lastName ?? ''} ${g.firstName ?? ''}`.trim() || g.phone || g.email || 'Гость');
    setGuestOpen(false); setGuestResults([]);
    void adminApi.guest(g.id).then((info) => { setGuestInfo(info); setGuestNotes(info.guestNotes ?? ''); setGuestNotesBase(info.guestNotes ?? ''); }).catch(() => setGuestInfo(null));
  };
  const clearGuest = () => { setGuestId(''); setGuestInfo(null); setGuestQuery(''); setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setGuestNotes(''); setGuestNotesBase(''); };

  // Загрузка доступности на диапазоны дат сегментов.
  useEffect(() => {
    const ranges = new Map<string, [string, string]>();
    segments.forEach((s) => { if (s.checkIn && s.checkOut && nightsOf(s.checkIn, s.checkOut) >= 1) ranges.set(rangeKey(s.checkIn, s.checkOut), [s.checkIn, s.checkOut]); });
    ranges.forEach(([ci, co], key) => {
      if (avail[key]) return;
      void adminApi.pmsAvailabilitySearch({ checkIn: ci, checkOut: co }).then((rows: PmsAvailabilityRow[]) => {
        const map: Record<string, { available: number; capacity: number }> = {};
        for (const r of rows) map[r.roomTypeId] = { available: r.available, capacity: r.capacity };
        setAvail((prev) => ({ ...prev, [key]: map }));
      }).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // Расчёт цены (quote) по сегменту, когда есть категория+тариф+даты.
  useEffect(() => {
    segments.forEach((s, i) => {
      const pid = propertyIdOf(s.roomTypeId);
      if (!pid || !s.roomTypeId || !s.ratePlanId || nightsOf(s.checkIn, s.checkOut) < 1) { setQuotes((q) => ({ ...q, [i]: null })); return; }
      setQuotes((q) => ({ ...q, [i]: 'loading' }));
      void adminApi.pmsQuote({ propertyId: pid, roomTypeId: s.roomTypeId, ratePlanId: s.ratePlanId, checkIn: s.checkIn, checkOut: s.checkOut, guests: s.adults + s.children })
        .then((q) => setQuotes((prev) => ({ ...prev, [i]: q.totalAmount })))
        .catch(() => setQuotes((prev) => ({ ...prev, [i]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, categories]);

  const patchSeg = (i: number, patch: Partial<Segment>) =>
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addSegment = () =>
    setSegments((prev) => { const last = prev[prev.length - 1]!; return [...prev, { ...last, roomId: '', totalPrice: '', extras: [] }]; });
  const removeSegment = (i: number) => setSegments((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  // Доп-услуги сегмента: добавить из каталога / убрать / изменить количество.
  const extrasForSeg = (rtId: string) => extras.filter((e) => e.active !== false && (e.roomTypeIds.length === 0 || (rtId ? e.roomTypeIds.includes(rtId) : true)));
  const addSegExtra = (i: number, extraId: string) => {
    const ex = extras.find((e) => e.id === extraId); if (!ex) return;
    patchSeg(i, { extras: [...(segments[i]?.extras ?? []), { extraId: ex.id, name: ex.name, unitPrice: ex.price, qty: 1 }] });
  };
  const setSegExtraQty = (i: number, idx: number, qty: number) =>
    patchSeg(i, { extras: (segments[i]?.extras ?? []).map((x, k) => (k === idx ? { ...x, qty: Math.max(1, qty) } : x)) });
  const removeSegExtra = (i: number, idx: number) =>
    patchSeg(i, { extras: (segments[i]?.extras ?? []).filter((_, k) => k !== idx) });

  // Смена категории → авто-выбор первого тарифа объекта, кламп гостей по вместимости.
  const onPickCategory = (i: number, rtId: string) => {
    const cat = catById(rtId);
    const cap = capOf(cat);
    const firstPlan = plansFor(rtId)[0]?.id ?? '';
    setSegments((prev) => prev.map((s, idx) => {
      if (idx !== i) return s;
      let adults = s.adults, children = s.children;
      if (adults + children > cap) { children = Math.max(0, cap - adults); if (adults + children > cap) adults = Math.max(1, cap - children); }
      return { ...s, roomTypeId: rtId, roomId: '', adults, children, ratePlanId: s.ratePlanId || firstPlan };
    }));
  };
  const clampGuests = (i: number, patch: { adults?: number; children?: number }) => {
    setSegments((prev) => prev.map((s, idx) => {
      if (idx !== i) return s;
      const cap = capOf(catById(s.roomTypeId));
      let adults = patch.adults ?? s.adults, children = patch.children ?? s.children;
      adults = Math.max(1, adults); children = Math.max(0, children);
      if (s.roomTypeId && adults + children > cap) {
        if (patch.children !== undefined) children = Math.max(0, cap - adults);
        else adults = Math.max(1, cap - children);
      }
      return { ...s, adults, children };
    }));
  };

  // Смена категории блока → все её номера отмечены.
  useEffect(() => {
    if (!blkRoomTypeId) { setBlkRoomIds(new Set()); return; }
    setBlkRoomIds(new Set(roomsOf(blkRoomTypeId).map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blkRoomTypeId, rooms]);

  async function submitBooking() {
    setError('');
    if (!firstName.trim() && !phone.trim() && !email.trim()) return setError('Укажите гостя: имя, телефон или почту.');
    for (const s of segments) {
      if (!s.roomTypeId) return setError('В каждой брони выберите категорию.');
      if (nightsOf(s.checkIn, s.checkOut) < 1) return setError('Дата выезда должна быть позже даты заезда.');
      if (!s.ratePlanId && !s.totalPrice.trim()) return setError('Выберите тариф или укажите стоимость вручную.');
    }
    setBusy(true);
    try {
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i]!;
        const pid = propertyIdOf(s.roomTypeId);
        const adults = Math.max(1, s.adults);
        const children = Math.max(0, s.children);
        await adminApi.pmsCreateBooking({
          propertyId: pid,
          roomTypeId: s.roomTypeId,
          roomId: s.roomId || undefined,
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          guests: adults + children,
          adults, children,
          arrivalTime: s.arrivalTime || undefined,
          departureTime: s.departureTime || undefined,
          ratePlanId: s.ratePlanId || undefined,
          totalPrice: s.ratePlanId ? undefined : Number(s.totalPrice),
          source,
          guestId: guestId || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone ? normalizePhone(phone) : undefined,
          email: email || undefined,
          bookingMethod: bookingMethod || undefined,
          referralSource: referralSource || undefined,
          discountReason: discountReason || undefined,
          extras: s.extras.length ? s.extras.map((x) => ({ extraId: x.extraId, qty: x.qty })) : undefined,
          comment: comment || undefined,
        }, (crypto.randomUUID ?? (() => Math.random().toString(36).slice(2) + Date.now().toString(36)))());
      }
      // Сохранить отредактированное примечание гостя (§3) — за существующим гостем из базы.
      if (guestId && guestNotes !== guestNotesBase) {
        await adminApi.updateGuest(guestId, { guestNotes }).catch(() => undefined);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать бронь.');
    } finally {
      setBusy(false);
    }
  }

  async function submitBlock() {
    setError('');
    if (!blkRoomTypeId) return setError('Выберите категорию.');
    if (blkRoomIds.size === 0) return setError('Отметьте хотя бы один номер.');
    if (nightsOf(blkFrom, blkTo) < 1) return setError('Дата окончания должна быть позже даты начала.');
    const type = BLOCK_REASONS.find((r) => r.value === blkReason)?.type ?? 'OUT_OF_ORDER';
    setBusy(true);
    try {
      for (const roomId of blkRoomIds) {
        await adminApi.pmsCreateBlock({ roomId, type, from: blkFrom, to: blkTo, reason: blkComment || undefined });
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось закрыть продажу.');
    } finally {
      setBusy(false);
    }
  }

  const catOptionLabel = (c: RoomFundCategory, checkIn: string, checkOut: string) => {
    const a = availFor(c.id, checkIn, checkOut);
    const cap = capOf(c);
    const av = a ? ` · свободно ${a.available}` : '';
    return `${c.property.name} · ${c.name} · до ${cap} мест${av}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-6 pt-5">
          <div className="flex gap-6">
            <button type="button" onClick={() => setTab('booking')} className={`pb-3 text-sm font-medium ${tab === 'booking' ? 'border-b-2 border-ink text-ink' : 'text-dark-gray'}`}>Бронирование</button>
            <button type="button" onClick={() => setTab('block')} className={`pb-3 text-sm font-medium ${tab === 'block' ? 'border-b-2 border-ink text-ink' : 'text-dark-gray'}`}>Закрытие продажи</button>
          </div>
          <button type="button" onClick={onClose} className="pb-3 text-2xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          {tab === 'booking' ? (
            <>
              {segments.map((s, i) => {
                const nights = nightsOf(s.checkIn, s.checkOut);
                const cat = catById(s.roomTypeId);
                const cap = capOf(cat);
                const a = availFor(s.roomTypeId, s.checkIn, s.checkOut);
                const q = quotes[i];
                return (
                  <div key={i} className="mb-4 rounded-lg border border-ink/10 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-dark-gray">Бронь {i + 1}{segments.length > 1 ? ` из ${segments.length}` : ''}</span>
                      {segments.length > 1 ? <button type="button" onClick={() => removeSegment(i)} className="text-xs text-red-600 hover:underline">Удалить</button> : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>Дата заезда</label>
                        <DatePicker value={s.checkIn} onChange={(v) => { if (v) patchSeg(i, { checkIn: v, checkOut: nightsOf(v, s.checkOut) < 1 ? plusDays(v, 1) : s.checkOut }); }} />
                      </div>
                      <div>
                        <label className={labelCls}>Дата выезда · <span className="text-ink">{nights} {nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей'}</span></label>
                        <DatePicker value={s.checkOut} min={plusDays(s.checkIn, 1)} onChange={(v) => { if (v) patchSeg(i, { checkOut: v }); }} />
                      </div>
                      <div>
                        <label className={labelCls}>Время заезда</label>
                        <input type="time" value={s.arrivalTime} onChange={(e) => patchSeg(i, { arrivalTime: e.target.value })} className={fieldCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Время выезда</label>
                        <input type="time" value={s.departureTime} onChange={(e) => patchSeg(i, { departureTime: e.target.value })} className={fieldCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Взрослые</label>
                        <input type="number" min={1} max={s.roomTypeId ? cap : undefined} value={s.adults} onChange={(e) => clampGuests(i, { adults: Number(e.target.value) })} className={fieldCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Дети</label>
                        <input type="number" min={0} max={s.roomTypeId ? cap : undefined} value={s.children} onChange={(e) => clampGuests(i, { children: Number(e.target.value) })} className={fieldCls} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Категория {s.roomTypeId ? <span className="text-ink/50">· до {cap} мест{a ? `, свободно ${a.available}` : ''}</span> : null}</label>
                        <select value={s.roomTypeId} onChange={(e) => onPickCategory(i, e.target.value)} className={fieldCls}>
                          <option value="">— выберите категорию —</option>
                          {catsSorted.map((c) => {
                            const tooSmall = capOf(c) < s.adults + s.children;
                            return <option key={c.id} value={c.id} disabled={tooSmall}>{catOptionLabel(c, s.checkIn, s.checkOut)}{tooSmall ? ' — мест недостаточно' : ''}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Номер (необязательно)</label>
                        <select value={s.roomId} onChange={(e) => patchSeg(i, { roomId: e.target.value })} className={fieldCls}>
                          <option value="">Назначить позже</option>
                          {roomsOf(s.roomTypeId).map((r) => <option key={r.id} value={r.id}>№{r.number}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Тариф</label>
                        <select value={s.ratePlanId} onChange={(e) => patchSeg(i, { ratePlanId: e.target.value })} className={fieldCls}>
                          <option value="">Ручная цена</option>
                          {plansFor(s.roomTypeId).map((p) => <option key={p.id} value={p.id}>{p.name}{p.availableBookingModule ? '' : ' · только стойка'}</option>)}
                        </select>
                        {plansFor(s.roomTypeId).some((p) => !p.availableBookingModule) ? <p className="mt-1 text-[10px] text-dark-gray">«только стойка» — тариф скрыт от гостей (в тарифе выключен «Модуль бронирования»).</p> : null}
                      </div>
                      {!s.ratePlanId ? (
                        <div>
                          <label className={labelCls}>Стоимость проживания, ₽</label>
                          <input type="number" min={0} value={s.totalPrice} onChange={(e) => patchSeg(i, { totalPrice: e.target.value })} className={fieldCls} placeholder="напр. 24000" />
                        </div>
                      ) : (
                        <div className="flex items-end text-sm">
                          {q === 'loading' ? <span className="text-dark-gray">Расчёт цены…</span>
                            : typeof q === 'number' ? <span className="font-medium text-ink">Цена: {q.toLocaleString('ru')} ₽ <span className="text-xs font-normal text-dark-gray">за {nights} ноч.</span></span>
                            : <span className="text-amber-700">Нет цены на эти даты</span>}
                        </div>
                      )}
                    </div>

                    {/* Доп-услуги этой брони (привязка к конкретной брони) */}
                    <div className="mt-3 border-t border-ink/10 pt-3">
                      <label className={labelCls}>Доп. услуги этой брони</label>
                      {/* Питание из выбранного тарифа — быстрое добавление */}
                      {(() => {
                        const meals = allPlans.find((p) => p.id === s.ratePlanId)?.meals ?? [];
                        if (!meals.length) return null;
                        return (
                          <div className="mb-2">
                            <p className="mb-1 text-[11px] text-dark-gray">Питание по тарифу</p>
                            <div className="flex flex-wrap gap-1.5">
                              {meals.map((m, mi) => {
                                const ex = extras.find((e) => e.name === m.type);
                                const already = s.extras.some((x) => x.name === m.type);
                                return (
                                  <button key={mi} type="button" disabled={already || !ex}
                                    onClick={() => ex && addSegExtra(i, ex.id)}
                                    title={ex ? '' : 'Услуга не найдена в каталоге доп. услуг'}
                                    className="rounded-full border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary-50 disabled:cursor-default disabled:border-ink/15 disabled:text-dark-gray">
                                    {already ? '✓ ' : '+ '}{m.type} · {Number(m.price).toLocaleString('ru')} ₽
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {s.extras.length ? (
                        <div className="mb-2 space-y-1">
                          {s.extras.map((x, xi) => (
                            <div key={xi} className="flex items-center gap-2 text-sm">
                              <span className="flex-1 text-ink">{x.name} · {x.unitPrice.toLocaleString('ru')} ₽</span>
                              <input type="number" min={1} value={x.qty} onChange={(e) => setSegExtraQty(i, xi, Number(e.target.value))} className="w-16 rounded-md border border-ink/20 px-2 py-1 text-sm" />
                              <span className="w-20 text-right text-dark-gray">{(x.unitPrice * x.qty).toLocaleString('ru')} ₽</span>
                              <button type="button" onClick={() => removeSegExtra(i, xi)} className="text-ink/40 hover:text-red-600" title="Убрать">×</button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <select value="" onChange={(e) => { if (e.target.value) addSegExtra(i, e.target.value); }} className={fieldCls} disabled={!s.roomTypeId}>
                        <option value="">{s.roomTypeId ? '+ добавить услугу…' : 'сначала выберите категорию'}</option>
                        {extrasForSeg(s.roomTypeId).map((ex) => <option key={ex.id} value={ex.id}>{ex.name} · {ex.price.toLocaleString('ru')} ₽</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}

              <button type="button" onClick={addSegment} className="mb-5 text-sm text-primary underline underline-offset-2 hover:no-underline">+ Добавить бронь с другими параметрами</button>

              <div className="mb-5 rounded-lg border border-ink/10 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-dark-gray">Заказчик</p>

                {/* Поиск гостя в базе (автоподстановка) */}
                <div className="relative mb-3">
                  <label className={labelCls}>Найти гостя в базе</label>
                  <div className="flex items-center gap-2">
                    <input value={guestQuery} onChange={(e) => { setGuestQuery(e.target.value); setGuestOpen(true); if (guestId) setGuestId(''); }} onFocus={() => setGuestOpen(true)} className={fieldCls} placeholder="Телефон, имя или email…" />
                    {guestId ? <button type="button" onClick={clearGuest} className="shrink-0 rounded-md border border-ink/20 px-2 py-2 text-xs text-ink hover:bg-ink/5">Сбросить</button> : null}
                  </div>
                  {guestOpen && !guestId && guestResults.length > 0 ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-ink/15 bg-white shadow-lg">
                      {guestResults.map((g) => {
                        const tm = tierMeta(g.loyaltyTier);
                        return (
                          <button key={g.id} type="button" onClick={() => pickGuest(g)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5">
                            <span className="truncate"><span className="text-ink">{`${g.lastName ?? ''} ${g.firstName ?? ''}`.trim() || 'Без имени'}</span> <span className="text-dark-gray">· {g.phone ?? g.email ?? ''}</span></span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${tm.badge}`}>{tm.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* Быстрый просмотр лояльности выбранного гостя */}
                {guestId && guestInfo ? (
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-ink/[0.03] px-3 py-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${tierMeta(guestInfo.loyaltyTier).badge}`}>{tierMeta(guestInfo.loyaltyTier).label} · начисление {tierMeta(guestInfo.loyaltyTier).earn}</span>
                      <span className="text-dark-gray">Баллы: <span className="font-medium text-ink">{guestInfo.loyalty.availableBalance}</span> доступно{guestInfo.loyalty.pendingBalance ? ` · ${guestInfo.loyalty.pendingBalance} ожидают` : ''}</span>
                      <span className="text-dark-gray">Броней: <span className="font-medium text-ink">{guestInfo.bookings?.length ?? 0}</span></span>
                    </div>
                    {/* Закреплённое за гостем примечание — редактируется прямо здесь (§3) */}
                    <div className="rounded-md border border-amber-300 bg-amber-50/70 px-3 py-2 text-sm">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-800">📌 Примечание гостя (сохранится в карточке гостя)</p>
                      <textarea value={guestNotes} onChange={(e) => setGuestNotes(e.target.value)} rows={2} placeholder="Пожелания и особенности гостя — видно во всех его бронях" className="w-full rounded-md border border-amber-300/70 bg-white px-2.5 py-1.5 text-sm text-ink" />
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={labelCls}>Имя</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldCls} /></div>
                  <div><label className={labelCls}>Фамилия</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldCls} /></div>
                  <div><label className={labelCls}>Телефон</label><PhoneInput value={phone} onChange={setPhone} className={fieldCls} /></div>
                  <div><label className={labelCls}>Почта</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldCls} /></div>
                </div>
                <div className="mt-3">
                  <label className={labelCls}>Примечание</label>
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={fieldCls} />
                </div>
              </div>

              <div className="mb-2 rounded-lg border border-ink/10 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-dark-gray">Маркетинг</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Источник</label>
                    <select value={source} onChange={(e) => setSource(e.target.value)} className={fieldCls}>
                      {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Способ бронирования</label>
                    <select value={bookingMethod} onChange={(e) => setBookingMethod(e.target.value)} className={fieldCls}>
                      <option value="">—</option>
                      {mkOpts('BOOKING_METHOD').map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Откуда узнали</label>
                    <select value={referralSource} onChange={(e) => setReferralSource(e.target.value)} className={fieldCls}>
                      <option value="">—</option>
                      {mkOpts('REFERRAL_SOURCE').map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Обоснование скидки</label>
                    <select value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} className={fieldCls}>
                      <option value="">—</option>
                      {mkOpts('DISCOUNT_REASON').map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Дата начала</label>
                  <DatePicker value={blkFrom} onChange={(v) => v && setBlkFrom(v)} />
                </div>
                <div>
                  <label className={labelCls}>Дата окончания · <span className="text-ink">{nightsOf(blkFrom, blkTo)} ноч.</span></label>
                  <DatePicker value={blkTo} min={plusDays(blkFrom, 1)} onChange={(v) => v && setBlkTo(v)} />
                </div>
              </div>
              <div className="mb-4">
                <label className={labelCls}>Категория</label>
                <select value={blkRoomTypeId} onChange={(e) => setBlkRoomTypeId(e.target.value)} className={fieldCls}>
                  <option value="">— выберите категорию —</option>
                  {catsSorted.map((c) => <option key={c.id} value={c.id}>{c.property.name} · {c.name}</option>)}
                </select>
              </div>
              {blkRoomTypeId ? (
                <div className="mb-4">
                  <label className={labelCls}>Номера ({blkRoomIds.size} выбрано)</label>
                  <div className="flex flex-wrap gap-2">
                    {roomsOf(blkRoomTypeId).map((r) => {
                      const on = blkRoomIds.has(r.id);
                      return (
                        <button key={r.id} type="button" onClick={() => setBlkRoomIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className={`rounded-md border px-3 py-1 text-xs ${on ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink'}`}>
                          №{r.number}
                        </button>
                      );
                    })}
                    {roomsOf(blkRoomTypeId).length === 0 ? <span className="text-xs text-dark-gray">В категории нет номеров.</span> : null}
                  </div>
                </div>
              ) : null}
              <div className="mb-4">
                <label className={labelCls}>Причина</label>
                <div className="flex gap-4">
                  {BLOCK_REASONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm text-ink">
                      <input type="radio" name="blkReason" checked={blkReason === r.value} onChange={() => setBlkReason(r.value)} />
                      {r.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-amber-700">Выбранные номера не будут доступны для продажи в этот период (влияет на загрузку и RevPAR).</p>
              </div>
              <div className="mb-2">
                <label className={labelCls}>Комментарий</label>
                <textarea value={blkComment} onChange={(e) => setBlkComment(e.target.value)} rows={2} className={fieldCls} maxLength={255} />
              </div>
            </>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-ink/10 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Отменить</Button>
          {tab === 'booking'
            ? <Button onClick={submitBooking} disabled={busy}>{busy ? 'Сохранение…' : `Создать ${segments.length > 1 ? `${segments.length} брони` : 'бронь'}`}</Button>
            : <Button onClick={submitBlock} disabled={busy}>{busy ? 'Сохранение…' : 'Закрыть продажу'}</Button>}
        </div>
      </div>
    </div>
  );
}
