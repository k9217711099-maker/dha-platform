'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type OpsGroup, type OpsStaff, type OpsTag, type OpsTask, type PmsBooking, type PmsRoom, type PmsRoomBlock, type PmsRoomOption } from '../../../lib/api';
import { STATUS as OPS_STATUS, fmtDT as opsFmtDT } from '../../ops/shared';
import { TaskCard } from '../../ops/TaskCard';
import { CreateTaskModal } from '../../ops/CreateTaskModal';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';
import { BookingCreateModal, type BookingPrefill } from './BookingCreateModal';
import { CategoryPreviewPopup } from './CategoryPreviewPopup';
import { BookingWindow } from './BookingWindow';
import { MoveBookingConfirm, type MoveTarget } from './MoveBookingConfirm';
import { balanceBadge, guestName, money, paidAmount, statusMeta, timeFrac } from './booking-view';
import { formatPhoneDisplay } from '../../../lib/phone';
import { tagHex } from '../../../lib/tags';
import { DatePicker } from '../../../components/DatePicker';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
// Показываем на шахматке и выехавших (CHECKED_OUT) — бронь не должна пропадать после выезда.
const OCCUPY: PmsBooking['status'][] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];
const COLW = 46, ROWH = 38, HEADH = 44, LEFTW = 240;
// Смещение старта шахматки: показываем 2 предыдущих дня относительно «сегодня» (§7).
const START_OFFSET = -2;

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
function dateRange(start: string, days: number): string[] {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const wdOf = (iso: string) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? '';
const isWeekend = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };
const fmtDM = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '');

interface TreeNode { propertyId: string; name: string; cats: { roomTypeId: string; name: string; rooms: PmsRoom[] }[]; roomCount: number; }
type FlatRow = { kind: 'property'; node: TreeNode } | { kind: 'category'; cat: TreeNode['cats'][number] } | { kind: 'room'; room: PmsRoom };
interface DragState { roomId: string; room: PmsRoom; startIdx: number; endIdx: number; }
interface Hover { booking: PmsBooking; x: number; y: number; }
/** Перетаскивание существующей брони: перенос по датам (dayDelta), в другой номер (overRoomId)
 *  или в другую категорию (overCatId — бронь становится нераспределённой в новой категории). */
interface MoveState { booking: PmsBooking; originRoomId: string; startX: number; startY: number; curX: number; curY: number; dayDelta: number; overRoomId: string; overCatId: string; moved: boolean; }

/** Статусы уборки номера на шахматке (§6). Цвета по договорённости владельца:
 *  грязный — красный, на уборке — жёлтый, чистый — синий, инспектирован — зелёный. */
const HK: Record<PmsRoom['housekeepingStatus'], { label: string; color: string }> = {
  DIRTY: { label: 'Грязный', color: '#ef4444' },
  IN_PROGRESS: { label: 'На уборке', color: '#f59e0b' },
  CLEAN: { label: 'Чистый', color: '#3b82f6' },
  INSPECTED: { label: 'Инспектирован', color: '#22c55e' },
};
const HK_ORDER: PmsRoom['housekeepingStatus'][] = ['DIRTY', 'IN_PROGRESS', 'CLEAN', 'INSPECTED'];

/** Мини-швабра внутрь цветных шаров статуса уборки (§12) — чтобы было понятно, что шар про уборку. */
const MopIcon = ({ className = 'h-2.5 w-2.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 4 L11 12" />
    <path d="M11 12 L6 17" />
    <path d="M4 19 L9 14 M6 21 L11 16 M8 22 L13 17" />
  </svg>
);

/** Маркеры плана уборок в режиме «Уборка» (§7-A): выезд-под-заезд (приоритет) / выезд / заезд / проживание. */
type CleanKind = 'b2b' | 'out' | 'in' | 'stay';
const CLEAN_MARK: Record<CleanKind, { label: string; color: string; icon: string }> = {
  b2b: { label: 'Выезд-под-заезд — приоритет', color: '#ef4444', icon: '⇄' },
  out: { label: 'Выезд — уборка после отъезда', color: '#f59e0b', icon: '↑' },
  in: { label: 'Заезд — подготовка номера', color: '#3b82f6', icon: '↓' },
  stay: { label: 'Проживание — освежить', color: '#94a3b8', icon: '·' },
};
const CLEAN_ORDER: CleanKind[] = ['b2b', 'out', 'in', 'stay'];

/** Техническое состояние номера (§7-C): OK / OOS (мягкий, продаётся) / OOO (жёсткий, снят с продажи). */
const MAINT: Record<PmsRoom['maintenanceStatus'], { label: string; color: string; hint: string }> = {
  OK: { label: 'Исправен', color: '#10b981', hint: 'Номер в порядке' },
  OUT_OF_SERVICE: { label: 'Дефект', color: '#f59e0b', hint: 'Мягкий флаг (OOS): дефект есть, номер ПРОДАЁТСЯ' },
  OUT_OF_ORDER: { label: 'Снят с продажи', color: '#ef4444', hint: 'Жёсткий (OOO): номер выбывает из доступности' },
};
const MAINT_ORDER: PmsRoom['maintenanceStatus'][] = ['OK', 'OUT_OF_SERVICE', 'OUT_OF_ORDER'];

export default function ShakhmatkaPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  // Личные данные гостей на шахматке (§15, ПДн) — только с правом pms_guest_pii; иначе маскируем.
  const canPii = me?.permissions.includes('pms_guest_pii') ?? false;
  const gName = (b: PmsBooking) => (canPii ? guestName(b) : 'Гость');
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [start, setStart] = useState(plusDays(todayIso(), START_OFFSET));
  const [days, setDays] = useState(21);
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [bookings, setBookings] = useState<PmsBooking[]>([]);
  const [blocks, setBlocks] = useState<PmsRoomBlock[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Свёрнутые категории (§4). По умолчанию свёрнута категория с 1 номером (брони показываются на ней).
  const [catCollapsed, setCatCollapsed] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<BookingPrefill | null>(null);
  const [previewRtId, setPreviewRtId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [fullBooking, setFullBooking] = useState<PmsBooking | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveError, setMoveError] = useState('');
  const moveRef = useRef<MoveState | null>(null);
  useEffect(() => { moveRef.current = move; }, [move]);

  const dates = useMemo(() => dateRange(start, days), [start, days]);
  const rangeEnd = dates[dates.length - 1] ?? start;
  const boardW = dates.length * COLW;
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  // Категория → объект/название (для переноса в категорию: проверка объекта, подпись).
  const catInfo = useMemo(() => {
    const m = new Map<string, { propertyId: string; propertyName: string; name: string }>();
    for (const r of rooms) if (!m.has(r.roomType.id)) m.set(r.roomType.id, { propertyId: r.property.id, propertyName: r.property.name, name: r.roomType.name });
    return m;
  }, [rooms]);

  useEffect(() => { if (ready) void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined); }, [ready]);

  const load = useCallback(() => {
    if (!ready) return;
    const filter = propertyId ? { propertyId } : {};
    void adminApi.pmsRooms(filter).then(setRooms).catch(() => undefined);
    void adminApi.pmsBookings({ ...filter, from: plusDays(start, -30), to: rangeEnd }).then(setBookings).catch(() => undefined);
    void adminApi.pmsBlocks(filter).then(setBlocks).catch(() => undefined);
  }, [ready, propertyId, start, rangeEnd]);
  useEffect(() => { load(); }, [load]);

  // Режим доски: брони / уборка (§7-A).
  const [boardMode, setBoardMode] = useState<'bookings' | 'housekeeping'>('bookings');
  // Панель номера «все задачи по номеру» (§7-B).
  const [roomPanel, setRoomPanel] = useState<PmsRoom | null>(null);
  // Статус уборки номера (§6): клик по цветной точке слева от номера → смена статуса.
  const [hkMenu, setHkMenu] = useState<string | null>(null);
  const changeHk = useCallback(async (roomId: string, status: PmsRoom['housekeepingStatus']) => {
    setHkMenu(null);
    setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, housekeepingStatus: status } : r))); // оптимистично
    await adminApi.pmsRoomStatus(roomId, { housekeepingStatus: status }).catch(() => undefined);
    load();
  }, [load]);

  // Дерево: объект → категория → номера.
  const tree = useMemo<TreeNode[]>(() => {
    const byProp = new Map<string, TreeNode>();
    for (const r of [...rooms].sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }))) {
      const node = byProp.get(r.property.id) ?? { propertyId: r.property.id, name: r.property.name, cats: [], roomCount: 0 };
      let cat = node.cats.find((c) => c.roomTypeId === r.roomType.id);
      if (!cat) { cat = { roomTypeId: r.roomType.id, name: r.roomType.name, rooms: [] }; node.cats.push(cat); }
      cat.rooms.push(r); node.roomCount++; byProp.set(r.property.id, node);
    }
    return [...byProp.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [rooms]);

  // Нераспределённые брони (без номера) по категориям — показываем прямо на строке категории (§1).
  const unassignedByCat = useMemo(() => {
    const m = new Map<string, PmsBooking[]>();
    for (const b of bookings) {
      if (!b.room && OCCUPY.includes(b.status) && b.status !== 'CHECKED_OUT') {
        const a = m.get(b.roomType.id) ?? []; a.push(b); m.set(b.roomType.id, a);
      }
    }
    return m;
  }, [bookings]);

  // Свободных номеров по (категория, дата): пул продаваемых − брони (вкл. нераспр.) − блоки (§3).
  const freeByCat = useMemo(() => {
    const DAY = 86_400_000;
    const day0 = new Date(`${dates[0]}T00:00:00Z`).getTime();
    const n = dates.length;
    const pool = new Map<string, number>();
    const rtByRoom = new Map<string, string>();
    for (const r of rooms) {
      rtByRoom.set(r.id, r.roomType.id);
      if (r.active && r.sellStatus === 'SELLABLE' && r.maintenanceStatus !== 'OUT_OF_ORDER') pool.set(r.roomType.id, (pool.get(r.roomType.id) ?? 0) + 1); // OOS (§7-C) остаётся в продаже
    }
    const occ = new Map<string, number[]>();
    const add = (rt: string | undefined, fromIso: string, toIso: string) => {
      if (!rt) return;
      let arr = occ.get(rt); if (!arr) { arr = new Array(n).fill(0); occ.set(rt, arr); }
      const lo = Math.max(0, Math.round((new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime() - day0) / DAY));
      const hi = Math.min(n, Math.round((new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime() - day0) / DAY));
      for (let i = lo; i < hi; i++) arr[i] = (arr[i] ?? 0) + 1;
    };
    for (const b of bookings) if (OCCUPY.includes(b.status)) add(b.roomType.id, b.checkIn, b.checkOut);
    for (const bl of blocks) add(rtByRoom.get(bl.roomId), bl.from, bl.to);
    const free = new Map<string, number[]>();
    for (const [rt, p] of pool) { const o = occ.get(rt); free.set(rt, Array.from({ length: n }, (_, i) => Math.max(0, p - (o?.[i] ?? 0)))); }
    return free;
  }, [rooms, bookings, blocks, dates]);

  // Категория свёрнута? По умолчанию: 1 номер → свёрнута, 2+ → развёрнута (§4).
  const catIsCollapsed = useCallback((cat: TreeNode['cats'][number]) => catCollapsed[cat.roomTypeId] ?? (cat.rooms.length === 1), [catCollapsed]);

  const flatRows = useMemo<FlatRow[]>(() => {
    const rowsArr: FlatRow[] = [];
    for (const node of tree) {
      rowsArr.push({ kind: 'property', node });
      if (!collapsed[node.propertyId]) for (const cat of node.cats) {
        rowsArr.push({ kind: 'category', cat });
        // Свёрнутая категория не раскрывает свои номера (брони номера показываются на самой категории, если он один).
        const catOpen = !(catCollapsed[cat.roomTypeId] ?? (cat.rooms.length === 1));
        if (catOpen) for (const room of cat.rooms) rowsArr.push({ kind: 'room', room });
      }
    }
    return rowsArr;
  }, [tree, collapsed, catCollapsed]);

  // Брони и блоки по номерам.
  const barsByRoom = useMemo(() => {
    const m = new Map<string, { b?: PmsBooking; block?: PmsRoomBlock }[]>();
    for (const b of bookings) { if (b.room && OCCUPY.includes(b.status)) { const a = m.get(b.room.id) ?? []; a.push({ b }); m.set(b.room.id, a); } }
    for (const bl of blocks) { const a = m.get(bl.roomId) ?? []; a.push({ block: bl }); m.set(bl.roomId, a); }
    return m;
  }, [bookings, blocks]);

  const unassigned = bookings.filter((b) => !b.room && b.status !== 'CHECKED_OUT' && OCCUPY.includes(b.status) && b.checkOut.slice(0, 10) > start).length;

  // План уборок по дням (§7-A): для каждого номера — что за уборка нужна в каждой видимой дате.
  const dateIdx = useMemo(() => new Map(dates.map((d, i) => [d, i])), [dates]);
  const cleaningByRoom = useMemo(() => {
    const m = new Map<string, Map<number, { out: boolean; in: boolean; stay: boolean }>>();
    const mark = (roomId: string, idx: number | undefined, key: 'out' | 'in' | 'stay') => {
      if (idx === undefined) return;
      let r = m.get(roomId); if (!r) { r = new Map(); m.set(roomId, r); }
      const cell = r.get(idx) ?? { out: false, in: false, stay: false }; cell[key] = true; r.set(idx, cell);
    };
    for (const b of bookings) {
      if (!b.room || !OCCUPY.includes(b.status)) continue;
      const ci = b.checkIn.slice(0, 10), co = b.checkOut.slice(0, 10);
      mark(b.room.id, dateIdx.get(ci), 'in'); // день заезда — подготовка
      mark(b.room.id, dateIdx.get(co), 'out'); // день выезда — уборка после отъезда
      for (let d = plusDays(ci, 1); d < co; d = plusDays(d, 1)) mark(b.room.id, dateIdx.get(d), 'stay'); // проживание
    }
    return m;
  }, [bookings, dateIdx]);

  // Линия «сейчас».
  const todayIdx = dates.indexOf(todayIso());
  const [nowFrac, setNowFrac] = useState(0);
  useEffect(() => { const upd = () => { const n = new Date(); setNowFrac((n.getHours() * 60 + n.getMinutes()) / 1440); }; upd(); const iv = setInterval(upd, 5 * 60_000); return () => clearInterval(iv); }, []);
  const lineLeft = todayIdx >= 0 ? (todayIdx + nowFrac) * COLW : null;

  // Drag-создание (по свободным клеткам).
  useEffect(() => {
    if (!drag) return;
    const onUp = () => {
      const lo = Math.min(drag.startIdx, drag.endIdx), hi = Math.max(drag.startIdx, drag.endIdx);
      const ci = dates[lo], last = dates[hi];
      if (ci && last) setModal({ propertyId: drag.room.property.id, roomTypeId: drag.room.roomType.id, roomId: drag.room.id, checkIn: ci, checkOut: plusDays(last, 1) });
      setDrag(null);
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [drag, dates]);

  // Drag-перенос существующей брони (перемещение по датам/номерам, §1).
  const moving = move !== null;
  useEffect(() => {
    if (!moving) return;
    const onMove = (e: MouseEvent) => {
      setMove((d) => d ? {
        ...d,
        curX: e.clientX, curY: e.clientY,
        dayDelta: Math.round((e.clientX - d.startX) / COLW),
        moved: d.moved || Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4,
      } : d);
    };
    const onUp = () => {
      const md = moveRef.current;
      setMove(null);
      if (!md) return;
      const b = md.booking;
      const newCheckIn = plusDays(b.checkIn.slice(0, 10), md.dayDelta);
      const newCheckOut = plusDays(b.checkOut.slice(0, 10), md.dayDelta);
      const datesChanged = md.dayDelta !== 0;
      // Приоритет цели: категория (overCatId) → конкретный номер (overRoomId) → без изменения.
      // Перенос в другую категорию/объект поддержан: если целевая категория из другого объекта,
      // бронь переезжает вместе с ним (propertyId), номер сбрасывается (§1).
      if (md.overCatId) {
        const ci = catInfo.get(md.overCatId);
        const catChanged = md.overCatId !== b.roomType.id;
        if (!md.moved || (!datesChanged && !catChanged)) { setFullBooking(b); return; }
        setMoveTarget({ booking: b, roomId: null, room: null, propertyId: ci?.propertyId, propertyName: ci?.propertyName, roomTypeId: md.overCatId, roomTypeName: ci?.name, checkIn: newCheckIn, checkOut: newCheckOut });
        return;
      }
      const targetRoomId = md.overRoomId || md.originRoomId;
      const roomChanged = targetRoomId !== md.originRoomId;
      // Не сдвинули — это был клик: открываем карточку брони.
      if (!md.moved || (!datesChanged && !roomChanged)) { setFullBooking(b); return; }
      const targetRoom = targetRoomId ? roomById.get(targetRoomId) : undefined;
      setMoveTarget({ booking: b, roomId: targetRoom?.id ?? null, room: targetRoom ?? null, propertyId: targetRoom?.property.id, propertyName: targetRoom?.property.name, roomTypeId: targetRoom?.roomType.id, roomTypeName: targetRoom?.roomType.name, checkIn: newCheckIn, checkOut: newCheckOut });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [moving, roomById, catInfo]);

  const startMove = (e: React.MouseEvent, b: PmsBooking, originRoomId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setHover(null);
    setMove({ booking: b, originRoomId, startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, dayDelta: 0, overRoomId: originRoomId, overCatId: '', moved: false });
  };
  const setOverRoom = (roomId: string) => setMove((d) => (d && (d.overRoomId !== roomId || d.overCatId) ? { ...d, overRoomId: roomId, overCatId: '' } : d));
  const setOverCat = (catId: string) => setMove((d) => (d && d.overCatId !== catId ? { ...d, overCatId: catId, overRoomId: '' } : d));

  // Геометрия «призрака» цели переноса (куда встанет бронь на целевой строке).
  const ghostGeom = () => {
    if (!move || !move.moved) return null;
    const b = move.booking;
    return barGeom(b.checkIn.slice(0, 10), b.checkOut.slice(0, 10), timeFrac(b.arrivalTime, 0.5), timeFrac(b.departureTime, 0.5), move.dayDelta);
  };

  const barGeom = useCallback((checkIn: string, checkOut: string, arrFrac: number, depFrac: number, shift = 0) => {
    const first = dates[0]; if (!first) return null;
    const startPos = diffDays(first, checkIn) + arrFrac + shift;
    const endPos = diffDays(first, checkOut) + depFrac + shift;
    if (endPos <= 0 || startPos >= dates.length) return null;
    const left = Math.max(0, startPos) * COLW;
    const right = Math.min(dates.length, endPos) * COLW;
    return { left, width: Math.max(8, right - left) };
  }, [dates]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-3xl font-light text-ink">PMS · Шахматка</h1>
        <Button onClick={() => setModal({ propertyId: propertyId || undefined })}>+ Добавить бронирование</Button>
      </div>
      <p className="mb-5 text-sm text-dark-gray">Потяните по свободным клеткам — создать бронь. Перетащите бронь на другую дату / номер / категорию / объект — перенести (исходная бронь остаётся на месте, пунктир показывает цель; затем подтверждение и пересчёт цены). Клик — карточка, наведение — детали. Числа в строке категории — свободные номера по датам.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
          <option value="">Вся сеть ({options.length} объектов)</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* Режим доски: брони / уборка (§7-A) */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(['bookings', 'housekeeping'] as const).map((bm) => (
            <button key={bm} type="button" onClick={() => setBoardMode(bm)} className={`rounded-md px-3 py-1.5 transition ${boardMode === bm ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>{bm === 'bookings' ? 'Брони' : '🧹 Уборка'}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setStart((sv) => plusDays(sv, -days))} className="rounded-md border border-ink/20 bg-white px-2.5 py-2 text-sm hover:bg-ink/5">‹</button>
          <div className="w-36"><DatePicker value={start} onChange={(v) => v && setStart(v)} /></div>
          <button type="button" onClick={() => setStart((sv) => plusDays(sv, days))} className="rounded-md border border-ink/20 bg-white px-2.5 py-2 text-sm hover:bg-ink/5">›</button>
          <button type="button" onClick={() => setStart(plusDays(todayIso(), START_OFFSET))} className="ml-1 rounded-md border border-ink/20 bg-white px-3 py-2 text-sm hover:bg-ink/5">Сегодня</button>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={selectCls}>
          <option value={14}>14 дней</option><option value={21}>21 день</option><option value={31}>31 день</option>
        </select>
        {boardMode === 'bookings' ? (
          <div className="flex items-center gap-3 text-xs text-dark-gray">
            {(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as const).map((s) => <span key={s} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-sm ${statusMeta(s).stripe}`} /> {statusMeta(s).label}</span>)}
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-ink/40" /> Блок</span>
          </div>
        ) : (
          /* Легенда плана уборок (§7-A) */
          <div className="flex items-center gap-3 text-xs text-dark-gray">
            {CLEAN_ORDER.map((k) => <span key={k} className="flex items-center gap-1" title={CLEAN_MARK[k].label}><span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white" style={{ backgroundColor: CLEAN_MARK[k].color }}>{CLEAN_MARK[k].icon}</span> {k === 'b2b' ? 'Выезд-под-заезд' : k === 'out' ? 'Выезд' : k === 'in' ? 'Заезд' : 'Проживание'}</span>)}
          </div>
        )}
        {/* Легенда статусов уборки — точка слева от номера (§6) */}
        <div className="flex items-center gap-3 border-l border-ink/10 pl-3 text-xs text-dark-gray">
          <span className="text-ink/40">Уборка номера:</span>
          {HK_ORDER.map((s) => <span key={s} className="flex items-center gap-1"><span className="grid h-[18px] w-[18px] place-items-center rounded-full" style={{ backgroundColor: HK[s].color }}><MopIcon className="h-2.5 w-2.5" /></span> {HK[s].label}</span>)}
        </div>
      </div>

      {unassigned > 0 ? <p className="mb-3 text-sm text-amber-700">Без назначенного номера: {unassigned} (перетащите бронь на строку номера, чтобы назначить)</p> : null}
      {moveError ? <p className="mb-3 flex items-center gap-3 text-sm text-red-600">{moveError}<button type="button" onClick={() => setMoveError('')} className="text-xs underline">скрыть</button></p> : null}

      <Card className="overflow-hidden p-0">
        <div className="max-h-[calc(100vh-250px)] overflow-auto">
        <div className="flex">
          {/* Левая колонка — объект/категория/номер (залипает по горизонтали) */}
          <div className="sticky left-0 z-30 shrink-0 border-r border-ink/10 bg-white" style={{ width: LEFTW }}>
            <div className="sticky top-0 z-40 flex items-end border-b border-ink/10 bg-white px-3 pb-1.5 text-xs font-medium text-dark-gray" style={{ height: HEADH }}>Объект / категория / номер</div>
            {flatRows.length === 0 ? <div className="px-3 py-4 text-sm text-dark-gray">Номеров нет.</div> : null}
            {flatRows.map((row, i) => {
              if (row.kind === 'property') {
                const isC = collapsed[row.node.propertyId] ?? false;
                return <div key={`p${row.node.propertyId}`} className="flex items-center bg-ink/[0.04] px-3" style={{ height: ROWH }}>
                  <button type="button" onClick={() => setCollapsed((s) => ({ ...s, [row.node.propertyId]: !isC }))} className="flex items-center gap-1.5 text-left text-sm font-medium text-ink">
                    <span className={`text-ink/40 transition ${isC ? '-rotate-90' : ''}`}>▾</span>{row.node.name}
                    <span className="text-xs font-normal text-dark-gray">· {row.node.roomCount}</span>
                  </button>
                </div>;
              }
              if (row.kind === 'category') {
                const un = unassignedByCat.get(row.cat.roomTypeId)?.length ?? 0;
                const cOpen = !catIsCollapsed(row.cat);
                return <div key={`c${row.cat.roomTypeId}${i}`} className="flex items-center gap-1 bg-white px-3 pl-4 text-xs uppercase tracking-wide text-dark-gray" style={{ height: ROWH }}>
                  <button type="button" onClick={() => setCatCollapsed((s) => ({ ...s, [row.cat.roomTypeId]: cOpen }))} title={cOpen ? 'Свернуть категорию' : 'Развернуть категорию'} className="shrink-0 text-ink/40 hover:text-ink">
                    <span className={`inline-block transition ${cOpen ? '' : '-rotate-90'}`}>▾</span>
                  </button>
                  <span className="truncate">{row.cat.name}</span><span className="shrink-0 text-ink/30">· {row.cat.rooms.length}</span>
                  {un > 0 ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] normal-case text-amber-700" title="Брони без назначенного номера — на строке категории">не распр.: {un}</span> : null}
                  <button type="button" onClick={() => setPreviewRtId(row.cat.roomTypeId)} title="Просмотр категории" className="shrink-0 text-ink/40 hover:text-ink">👁</button>
                </div>;
              }
              {
                const room = row.room;
                const hk = HK[room.housekeepingStatus];
                const hkOpen = hkMenu === room.id;
                return (
                  <div key={room.id} className="relative flex items-center gap-1.5 whitespace-nowrap bg-white px-3 pl-6 text-sm text-ink" style={{ height: ROWH }}>
                    {/* Статус уборки (§6, §12): цветной шар со шваброй, клик — сменить */}
                    <button
                      type="button" title={`Уборка: ${hk.label}`}
                      onClick={() => setHkMenu(hkOpen ? null : room.id)}
                      className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110"
                      style={{ backgroundColor: hk.color }}
                    ><MopIcon className="h-2.5 w-2.5" /></button>
                    <button type="button" onClick={() => setRoomPanel(room)} className="font-medium hover:text-primary hover:underline" title="Все задачи и статусы номера">№{room.number}</button>
                    {room.floor ? <span className="text-xs text-dark-gray">эт.{room.floor}</span> : null}
                    {room.maintenanceStatus === 'OUT_OF_ORDER' ? <span title="Снят с продажи (ремонт, OOO)" className="rounded bg-rose-100 px-1 text-[10px] text-rose-700">рем</span>
                      : room.maintenanceStatus === 'OUT_OF_SERVICE' ? <span title="Дефект — номер продаётся (OOS)" className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">деф</span> : null}
                    {hkOpen ? (
                      <div className="absolute left-6 top-full z-40 mt-0.5 w-44 rounded-lg border border-ink/10 bg-white py-1 shadow-xl" onMouseLeave={() => setHkMenu(null)}>
                        {HK_ORDER.map((s) => (
                          <button key={s} type="button" onClick={() => void changeHk(room.id, s)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 ${room.housekeepingStatus === s ? 'font-semibold' : ''}`}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: HK[s].color }} />{HK[s].label}
                            {room.housekeepingStatus === s ? <span className="ml-auto text-[10px] text-slate-400">текущий</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }
            })}
          </div>

          {/* Правая колонка — таймлайн */}
          <div className="shrink-0" style={{ width: boardW }}>
            <div className="relative" style={{ width: boardW }}>
              {/* заголовок дат — залипает по вертикали при скролле (§3) */}
              <div className="sticky top-0 z-30 flex border-b border-ink/10 bg-white" style={{ height: HEADH }}>
                {dates.map((d, i) => (
                  <div key={d} className={`flex flex-col items-center justify-end pb-1 text-[11px] ${i === todayIdx ? 'bg-red-50 text-red-600' : isWeekend(d) ? 'bg-amber-50 text-amber-700' : 'text-dark-gray'}`} style={{ width: COLW }}>
                    <span>{d.slice(8)}</span><span className="text-ink/40">{wdOf(d)}</span>
                  </div>
                ))}
              </div>
              {/* линия «сейчас» */}
              {lineLeft != null ? <div className="pointer-events-none absolute bottom-0 z-20 w-0.5 bg-red-500/80" style={{ left: lineLeft, top: HEADH }}><span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-red-500 px-1 text-[8px] leading-tight text-white">сейчас</span></div> : null}

              {/* строки */}
              {flatRows.map((row, i) => {
                if (row.kind === 'property') {
                  return <div key={`s${i}`} className="flex bg-ink/[0.04]" style={{ height: ROWH }}>
                    {dates.map((d) => <div key={d} className={`border-l border-ink/[0.06] ${isWeekend(d) ? 'bg-amber-50/40' : ''}`} style={{ width: COLW }} />)}
                  </div>;
                }
                if (row.kind === 'category') {
                  // Нераспределённые брони (без номера) показываем прямо на строке категории (§1),
                  // числа свободных номеров по датам (§3), приём переноса в категорию (§1).
                  const list = unassignedByCat.get(row.cat.roomTypeId) ?? [];
                  const free = freeByCat.get(row.cat.roomTypeId);
                  const catOpen = !catIsCollapsed(row.cat);
                  // 1 номер в свёрнутой категории → его брони показываем на категории; 2+ свёрнуты → без броней (§4).
                  const solo = !catOpen && row.cat.rooms.length === 1 ? row.cat.rooms[0]! : null;
                  const soloItems = solo ? (barsByRoom.get(solo.id) ?? []) : [];
                  const hideBars = !catOpen && row.cat.rooms.length > 1;
                  const isCatTarget = move != null && move.moved && !solo && move.overCatId === row.cat.roomTypeId;
                  const soloTarget = solo != null && move != null && move.moved && move.overRoomId === solo.id;
                  const ghost = isCatTarget || soloTarget ? ghostGeom() : null;
                  return (
                    <div key={`c${row.cat.roomTypeId}${i}`} className={`relative flex ${isCatTarget || soloTarget ? 'bg-primary-50' : 'bg-white'}`} style={{ height: ROWH }}
                      onMouseEnter={() => { if (move) { if (solo) setOverRoom(solo.id); else setOverCat(row.cat.roomTypeId); } }}>
                      {dates.map((d, di) => {
                        const f = free?.[di];
                        // Число свободных номеров — в НИЖНЕЙ полосе ячейки, чтобы бронь-плашка сверху его не перекрывала (§2).
                        return (
                          <div key={d} className={`relative border-l border-ink/[0.06] ${isWeekend(d) ? 'bg-amber-50/40' : ''}`} style={{ width: COLW }}>
                            {f !== undefined ? <span className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pb-0.5 text-[11px] font-medium ${f === 0 ? 'text-red-500' : 'text-ink/50'}`}>{f}</span> : null}
                          </div>
                        );
                      })}
                      {ghost ? <div className="pointer-events-none absolute top-0.5 z-[6] h-4 rounded-md border-2 border-dashed border-primary bg-primary/10" style={{ left: ghost.left + 1, width: ghost.width - 2 }} /> : null}
                      {/* Свёрнутая категория с 1 номером — брони/блоки номера прямо на категории (§4) */}
                      {solo ? soloItems.map((it, k) => {
                        if (it.block) {
                          const g = barGeom(it.block.from.slice(0, 10), it.block.to.slice(0, 10), 0, 0);
                          if (!g) return null;
                          return <div key={`sbl${k}`} title={`Блок: ${it.block.type}`} className="absolute top-1 bottom-1 z-10 flex items-center overflow-hidden rounded-md border border-ink/30 bg-ink/20 px-2 text-[11px] text-ink/70" style={{ left: g.left + 1, width: g.width - 2 }}>Недоступ.</div>;
                        }
                        const b = it.b!;
                        const isMoving = move?.booking.id === b.id;
                        const g = barGeom(b.checkIn.slice(0, 10), b.checkOut.slice(0, 10), timeFrac(b.arrivalTime, 0.5), timeFrac(b.departureTime, 0.5), 0);
                        if (!g) return null;
                        const sm = statusMeta(b.status);
                        const bal = balanceBadge(b, todayIso());
                        const canMove = !['CHECKED_OUT', 'CANCELLED'].includes(b.status) && !b.roomLocked;
                        return (
                          <div key={b.id}
                            onMouseDown={(e) => { if (canMove) startMove(e, b, solo.id); }}
                            onClick={(e) => { e.stopPropagation(); if (!canMove) { setFullBooking(b); setHover(null); } }}
                            onMouseEnter={(e) => { if (!move) setHover({ booking: b, x: e.clientX, y: e.clientY }); }}
                            onMouseMove={(e) => setHover((h) => (h && h.booking.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h))}
                            onMouseLeave={() => setHover(null)}
                            title={`№${solo.number}${b.roomLocked ? ' · номер зафиксирован' : ''}`}
                            className={`absolute top-1 bottom-1 z-10 flex items-center overflow-hidden rounded-md border-l-4 ${sm.border} ${sm.bg} pl-2 pr-1 shadow-sm ring-1 ring-ink/10 hover:ring-ink/30 ${canMove ? 'cursor-grab' : 'cursor-pointer'} ${isMoving ? 'pointer-events-none opacity-50 ring-2 ring-primary' : ''}`}
                            style={{ left: g.left + 1, width: g.width - 2 }}>
                            <span className="truncate text-[11px] font-medium text-ink">{gName(b)}</span>
                            {b.tags?.length ? <span className="ml-1 flex shrink-0 items-center gap-0.5">{b.tags.slice(0, 4).map((t) => <span key={t.id} title={t.name} className="h-2 w-2 rounded-full ring-1 ring-white/70" style={{ backgroundColor: tagHex(t.color) }} />)}</span> : null}
                            {bal ? <span className={`ml-auto shrink-0 rounded px-1 text-[9px] font-semibold ${bal.kind === 'green' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{Math.round(bal.amount / 1000)}к</span> : null}
                          </div>
                        );
                      }) : null}
                      {!hideBars ? list.map((b) => {
                        const isMoving = move?.booking.id === b.id;
                        // Исходная бронь остаётся на месте (без сдвига по dayDelta) — цель показывает пунктир (§1).
                        const g = barGeom(b.checkIn.slice(0, 10), b.checkOut.slice(0, 10), timeFrac(b.arrivalTime, 0.5), timeFrac(b.departureTime, 0.5), 0);
                        if (!g) return null;
                        const sm = statusMeta(b.status);
                        return (
                          <div key={b.id}
                            onMouseDown={(e) => startMove(e, b, '')}
                            onMouseEnter={(e) => { if (!move) setHover({ booking: b, x: e.clientX, y: e.clientY }); }}
                            onMouseMove={(e) => setHover((h) => (h && h.booking.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h))}
                            onMouseLeave={() => setHover(null)}
                            title="Без назначенного номера — перетащите на строку номера, чтобы назначить"
                            className={`absolute top-0.5 z-10 flex h-4 cursor-grab items-center overflow-hidden rounded-md border border-dashed border-l-4 ${sm.border} ${sm.bg} pl-2 pr-1 shadow-sm ring-1 ring-ink/10 hover:ring-ink/30 ${isMoving ? 'pointer-events-none opacity-50 ring-2 ring-primary' : ''}`}
                            style={{ left: g.left + 1, width: g.width - 2, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.5) 0 5px, transparent 5px 10px)' }}>
                            <span className="truncate text-[10px] font-medium text-ink">{gName(b)}</span>
                            {b.tags?.length ? <span className="ml-1 flex shrink-0 items-center gap-0.5">{b.tags.slice(0, 3).map((t) => <span key={t.id} title={t.name} className="h-1.5 w-1.5 rounded-full ring-1 ring-white/70" style={{ backgroundColor: tagHex(t.color) }} />)}</span> : null}
                          </div>
                        );
                      }) : null}
                    </div>
                  );
                }
                const room = row.room;
                const items = barsByRoom.get(room.id) ?? [];
                const isDropTarget = move != null && move.moved && move.overRoomId === room.id;
                const roomGhost = isDropTarget ? ghostGeom() : null;
                const cleanCells = boardMode === 'housekeeping' ? cleaningByRoom.get(room.id) : undefined;
                return (
                  <div key={room.id} className={`relative border-t border-ink/5 ${isDropTarget ? 'bg-primary-50' : ''}`} style={{ height: ROWH }}
                    onMouseEnter={() => { if (move) setOverRoom(room.id); }}>
                    {/* фон-клетки (drag-создание) */}
                    <div className="flex h-full">
                      {dates.map((d, idx) => {
                        const selected = drag && drag.roomId === room.id && idx >= Math.min(drag.startIdx, drag.endIdx) && idx <= Math.max(drag.startIdx, drag.endIdx);
                        return <div key={d} onMouseDown={() => { if (!move) setDrag({ roomId: room.id, room, startIdx: idx, endIdx: idx }); }}
                          onMouseEnter={() => setDrag((prev) => (prev && prev.roomId === room.id ? { ...prev, endIdx: idx } : prev))}
                          className={`border-l border-ink/[0.06] ${isWeekend(d) ? 'bg-amber-50/40' : ''} ${selected ? '' : move ? '' : 'hover:bg-ink/[0.03]'}`} style={{ width: COLW }} />;
                      })}
                    </div>
                    {/* Оверлей плана уборок (§7-A): маркеры выезд/заезд/back-to-back/проживание по дням */}
                    {cleanCells ? (
                      <div className="pointer-events-none absolute inset-0 z-20">
                        {[...cleanCells.entries()].map(([idx, c]) => {
                          const kind: CleanKind = c.out && c.in ? 'b2b' : c.out ? 'out' : c.in ? 'in' : 'stay';
                          const mk = CLEAN_MARK[kind];
                          return <div key={idx} title={mk.label} className="absolute top-1 flex items-center justify-center rounded text-[10px] font-bold text-white shadow-sm" style={{ left: idx * COLW + 3, width: COLW - 6, height: 16, backgroundColor: mk.color }}>{mk.icon}</div>;
                        })}
                      </div>
                    ) : null}
                    {/* подсветка drag-создания + подсказка «N ночей · дата — дата» */}
                    {drag && drag.roomId === room.id ? (() => {
                      const lo = Math.min(drag.startIdx, drag.endIdx), hi = Math.max(drag.startIdx, drag.endIdx);
                      const nights = hi - lo + 1;
                      const ci = dates[lo]; const co = dates[hi] ? plusDays(dates[hi], 1) : undefined;
                      const nightsWord = nights === 1 ? 'ночь' : nights < 5 ? 'ночи' : 'ночей';
                      return (
                        <>
                          <div className="pointer-events-none absolute top-1 bottom-1 z-[5] rounded-md border border-emerald-500/70 bg-emerald-400/25" style={{ left: lo * COLW + 2, width: (hi - lo + 1) * COLW - 4 }} />
                          <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-lg" style={{ left: lo * COLW + ((hi - lo + 1) * COLW) / 2, top: 2 }}>
                            {nights} {nightsWord} · {fmtDM(ci)} — {fmtDM(co)}
                          </div>
                        </>
                      );
                    })() : null}
                    {/* призрак цели переноса (куда встанет бронь) — в т.ч. в исходной строке при сдвиге по датам */}
                    {roomGhost ? <div className="pointer-events-none absolute top-1 bottom-1 z-[6] rounded-md border-2 border-dashed border-primary bg-primary/10" style={{ left: roomGhost.left + 1, width: roomGhost.width - 2 }} /> : null}
                    {/* брони и блоки */}
                    {items.map((it, k) => {
                      if (it.block) {
                        const g = barGeom(it.block.from.slice(0, 10), it.block.to.slice(0, 10), 0, 0);
                        if (!g) return null;
                        return <div key={`bl${k}`} title={`Блок: ${it.block.type}${it.block.reason ? ` · ${it.block.reason}` : ''}`} className="absolute top-1 bottom-1 z-10 flex items-center overflow-hidden rounded-md border border-ink/30 bg-ink/20 px-2 text-[11px] text-ink/70" style={{ left: g.left + 1, width: g.width - 2 }}>Недоступ.</div>;
                      }
                      const b = it.b!;
                      const isMoving = move?.booking.id === b.id;
                      // Исходная бронь остаётся на месте (без сдвига); цель показывает пунктирный призрак (§1).
                      const g = barGeom(b.checkIn.slice(0, 10), b.checkOut.slice(0, 10), timeFrac(b.arrivalTime, 0.5), timeFrac(b.departureTime, 0.5), 0);
                      if (!g) return null;
                      const sm = statusMeta(b.status);
                      const bal = balanceBadge(b, todayIso());
                      const canMove = !['CHECKED_OUT', 'CANCELLED'].includes(b.status) && !b.roomLocked;
                      return (
                        <div key={b.id}
                          onMouseDown={(e) => { if (canMove) startMove(e, b, room.id); }}
                          onClick={(e) => { e.stopPropagation(); if (!canMove) { setFullBooking(b); setHover(null); } }}
                          onMouseEnter={(e) => { if (!move) setHover({ booking: b, x: e.clientX, y: e.clientY }); }}
                          onMouseMove={(e) => setHover((h) => (h && h.booking.id === b.id ? { ...h, x: e.clientX, y: e.clientY } : h))}
                          onMouseLeave={() => setHover(null)}
                          title={b.roomLocked ? 'Номер зафиксирован — перенос запрещён' : undefined}
                          className={`absolute top-1 bottom-1 z-10 flex items-center overflow-hidden rounded-md border-l-4 ${sm.border} ${sm.bg} pl-2 pr-1 shadow-sm ring-1 ring-ink/10 hover:ring-ink/30 ${canMove ? 'cursor-grab' : 'cursor-pointer'} ${isMoving ? 'pointer-events-none opacity-50 ring-2 ring-primary' : ''} ${boardMode === 'housekeeping' ? 'opacity-40' : ''}`}
                          style={{ left: g.left + 1, width: g.width - 2 }}>
                          <span className="truncate text-[11px] font-medium text-ink">{gName(b)}</span>
                          {b.tags?.length ? (
                            <span className="ml-1 flex shrink-0 items-center gap-0.5">
                              {b.tags.slice(0, 4).map((t) => <span key={t.id} title={t.name} className="h-2 w-2 rounded-full ring-1 ring-white/70" style={{ backgroundColor: tagHex(t.color) }} />)}
                            </span>
                          ) : null}
                          {bal ? <span className={`ml-auto shrink-0 rounded px-1 text-[9px] font-semibold ${bal.kind === 'green' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{Math.round(bal.amount / 1000)}к</span> : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
      </Card>

      {/* Плавающая подсказка при переносе брони */}
      {move && move.moved ? <MoveHint move={move} roomById={roomById} catInfo={catInfo} /> : null}

      {hover && !move ? <BookingTooltip hover={hover} canPii={canPii} /> : null}
      {modal ? <BookingCreateModal options={options} rooms={rooms} prefill={modal} onClose={() => setModal(null)} onCreated={load} /> : null}
      {previewRtId ? <CategoryPreviewPopup roomTypeId={previewRtId} onClose={() => setPreviewRtId(null)} /> : null}
      {fullBooking ? <BookingWindow booking={fullBooking} rooms={rooms} onClose={() => setFullBooking(null)} onChanged={load} /> : null}
      {moveTarget ? <MoveBookingConfirm target={moveTarget} onClose={() => setMoveTarget(null)} onDone={() => { setMoveTarget(null); load(); }} onError={(m) => setMoveError(m)} /> : null}
      {roomPanel ? <RoomPanel room={roomPanel} bookings={bookings} canPii={canPii} onClose={() => setRoomPanel(null)} onChanged={load} /> : null}
    </main>
  );
}

/** Панель номера (§7-B): статусы уборки/техсостояния, гость в номере, все задачи номера, создание через стандартную модалку. */
function RoomPanel({ room, bookings, canPii, onClose, onChanged }: { room: PmsRoom; bookings: PmsBooking[]; canPii: boolean; onClose: () => void; onChanged: () => void }) {
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [hk, setHk] = useState(room.housekeepingStatus);
  const [maint, setMaint] = useState(room.maintenanceStatus);
  // Открытие карточки задачи прямо из панели номера (техническая карточка на шахматке).
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [staff, setStaff] = useState<OpsStaff[]>([]);
  // Справочники для стандартной модалки создания задачи (§8).
  const [groups, setGroups] = useState<OpsGroup[]>([]);
  const [tags, setTags] = useState<OpsTag[]>([]);
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  // Фильтр списка: все / задачи / уборки (§8).
  const [listKind, setListKind] = useState<'' | 'TASK' | 'CLEANING'>('');

  const [showCreate, setShowCreate] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    adminApi.opsTasksByRoom(room.id).then(setTasks).catch(() => setTasks([])).finally(() => setLoading(false));
  }, [room.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    void adminApi.opsStaff().then(setStaff).catch(() => undefined);
    void adminApi.opsGroups().then(setGroups).catch(() => undefined);
    void adminApi.opsTags().then(setTags).catch(() => undefined);
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => { setHk(room.housekeepingStatus); setMaint(room.maintenanceStatus); }, [room.housekeepingStatus, room.maintenanceStatus]);

  // Гость: живущий сейчас, иначе ближайший заезд по этому номеру.
  const today = todayIso();
  const guestB = useMemo(() => {
    const mine = bookings.filter((b) => b.room?.id === room.id && OCCUPY.includes(b.status));
    return mine.find((b) => b.status === 'CHECKED_IN')
      ?? mine.filter((b) => b.checkIn.slice(0, 10) >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
      ?? null;
  }, [bookings, room.id, today]);

  const setHkStatus = async (s: PmsRoom['housekeepingStatus']) => {
    setHk(s);
    await adminApi.pmsRoomStatus(room.id, { housekeepingStatus: s }).catch(() => undefined);
    onChanged();
  };
  const setMaintStatus = async (s: PmsRoom['maintenanceStatus']) => {
    setMaint(s);
    await adminApi.pmsRoomStatus(room.id, { maintenanceStatus: s }).catch(() => undefined);
    onChanged();
  };
  // Сортировка (§8): открытые сверху (важные → ближайший срок → новее), закрытые в конце.
  const filtered = tasks.filter((t) => !listKind || t.kind === listKind);
  const byOpen = (t: OpsTask) => !['DONE', 'CANCELLED'].includes(t.status);
  const openSort = (a: OpsTask, b: OpsTask) =>
    Number(b.important) - Number(a.important)
    || (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity)
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const ordered = [
    ...filtered.filter(byOpen).sort(openSort),
    ...filtered.filter((t) => !byOpen(t)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  ];
  const countOf = (k: '' | 'TASK' | 'CLEANING') => tasks.filter((t) => !k || t.kind === k).length;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/20" />
      <div className="absolute right-0 top-0 flex h-full w-[440px] max-w-[92vw] flex-col overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <h2 className="text-xl font-medium text-ink">№{room.number}{room.floor ? <span className="ml-1 text-sm text-dark-gray">эт.{room.floor}</span> : null}</h2>
            <p className="text-xs text-dark-gray">{room.property.name} · {room.roomType.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">✕</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Статус уборки — быстрая смена */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-dark-gray">Уборка</p>
            <div className="flex flex-wrap gap-1.5">
              {HK_ORDER.map((s) => (
                <button key={s} type="button" onClick={() => void setHkStatus(s)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${hk === s ? 'border-transparent text-white' : 'border-ink/15 text-slate-500 hover:border-ink/30'}`} style={hk === s ? { backgroundColor: HK[s].color } : {}}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HK[s].color }} />{HK[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Техническое состояние (§7-C): OK / OOS (продаётся) / OOO (снят с продажи) */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-dark-gray">Техническое состояние</p>
            <div className="flex flex-wrap gap-1.5">
              {MAINT_ORDER.map((s) => (
                <button key={s} type="button" title={MAINT[s].hint} onClick={() => void setMaintStatus(s)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${maint === s ? 'border-transparent text-white' : 'border-ink/15 text-slate-500 hover:border-ink/30'}`} style={maint === s ? { backgroundColor: MAINT[s].color } : {}}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MAINT[s].color }} />{MAINT[s].label}
                </button>
              ))}
            </div>
            {maint === 'OUT_OF_SERVICE' ? <p className="mt-1 text-[11px] text-amber-600">Дефект зафиксирован, номер остаётся в продаже.</p> : maint === 'OUT_OF_ORDER' ? <p className="mt-1 text-[11px] text-rose-600">Номер снят с продажи — выбывает из доступности.</p> : null}
          </div>

          {/* Гость в номере */}
          {guestB ? (
            <div className="rounded-lg border border-ink/10 bg-slate-50 px-3 py-2 text-sm">
              <p className="text-xs text-dark-gray">{guestB.status === 'CHECKED_IN' ? 'Проживает сейчас' : 'Ближайший заезд'}</p>
              <p className="font-medium text-ink">{canPii ? guestName(guestB) : 'Гость'}</p>
              <p className="text-xs text-dark-gray">{fmtDM(guestB.checkIn.slice(0, 10))} — {fmtDM(guestB.checkOut.slice(0, 10))}</p>
            </div>
          ) : null}

          {/* Добавить задачу на номер (§16): стандартное окно создания, номер предустановлен */}
          <button type="button" onClick={() => setShowCreate(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-sm font-medium text-primary transition hover:bg-primary-50">＋ Добавить задачу на №{room.number}</button>

          {/* Все задачи и уборки номера — единый список с фильтром (§8) */}
          <div>
            <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs" style={{ width: 'fit-content' }}>
              {([['', 'Все'], ['TASK', 'Задачи'], ['CLEANING', 'Уборки']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setListKind(k)} className={`rounded-md px-2.5 py-1 transition ${listKind === k ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>
                  {l} <span className="text-slate-400">{countOf(k)}</span>
                </button>
              ))}
            </div>
            {loading ? <p className="py-4 text-center text-sm text-slate-400">Загрузка…</p> : (
              <RoomTaskList
                title={listKind === 'CLEANING' ? 'Уборки номера' : listKind === 'TASK' ? 'Задачи номера' : 'Задачи и уборки номера'}
                items={ordered}
                empty={listKind === 'CLEANING' ? 'Уборок по номеру нет.' : listKind === 'TASK' ? 'Задач по номеру нет.' : 'По номеру пока пусто.'}
                onOpen={setOpenTask}
              />
            )}
          </div>
        </div>
      </div>
      {openTask ? <TaskCard taskId={openTask} staff={staff} onClose={() => setOpenTask(null)} onChanged={() => { load(); onChanged(); }} /> : null}
      {showCreate ? (
        <CreateTaskModal
          staff={staff} groups={groups} tags={tags} options={options} defaultKind="TASK"
          presetRoom={{ propertyId: room.property.id, roomId: room.id }}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); onChanged(); }}
        />
      ) : null}
    </div>
  );
}

/** Секция задач/уборок номера в карточке (§16). Клик по строке — открыть карточку задачи. */
function RoomTaskList({ title, items, empty, onOpen }: { title: string; items: OpsTask[]; empty: string; onOpen: (id: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-dark-gray">{title} <span className="rounded-full bg-ink/10 px-1.5 text-[10px] text-ink/60">{items.length}</span></p>
      {items.length === 0 ? <p className="py-2 text-center text-xs text-slate-400">{empty}</p> : (
        <div className="space-y-1.5">
          {items.map((t) => {
            const st = OPS_STATUS[t.status];
            return (
              <button key={t.id} type="button" onClick={() => onOpen(t.id)} title="Открыть карточку задачи" className="flex w-full items-start gap-2 rounded-lg border border-ink/10 px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary-50/40">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: st.dot }} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    {t.important ? <span title="Важная">🔥</span> : null}
                    <span className="truncate">{t.title}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-dark-gray">
                    <span>{t.kind === 'CLEANING' ? '🧹 Уборка' : '🔧 Задача'}</span>
                    <span className={`rounded-full px-1.5 py-0.5 ${st.cls}`}>{st.label}</span>
                    {t.group ? <span>· {t.group.name}</span> : t.assignees[0] ? <span>· назначена</span> : <span>· без исполнителя</span>}
                    {t.dueAt ? <span>· срок {opsFmtDT(t.dueAt)}</span> : null}
                  </p>
                </div>
                <span className="mt-0.5 shrink-0 text-xs text-slate-300">›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Плавающая подсказка у курсора при переносе брони: цель (даты/номер/категория). */
function MoveHint({ move, roomById, catInfo }: { move: MoveState; roomById: Map<string, PmsRoom>; catInfo: Map<string, { propertyId: string; propertyName: string; name: string }> }) {
  const b = move.booking;
  const newCheckIn = plusDays(b.checkIn.slice(0, 10), move.dayDelta);
  const newCheckOut = plusDays(b.checkOut.slice(0, 10), move.dayDelta);
  let targetLabel: string;
  if (move.overCatId) {
    const ci = catInfo.get(move.overCatId);
    const cross = ci && ci.propertyId !== b.property.id;
    targetLabel = `${cross ? `${ci!.propertyName} · ` : ''}${ci?.name ?? 'категория'} · без номера`;
  } else {
    const target = move.overRoomId ? roomById.get(move.overRoomId) : undefined;
    const cross = target && target.property.id !== b.property.id;
    targetLabel = target ? `${cross ? `${target.property.name} · ` : ''}№${target.number}` : 'номер не назначен';
  }
  return (
    <div className="pointer-events-none fixed z-[70] -translate-y-full rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg" style={{ left: move.curX + 14, top: move.curY - 6 }}>
      → {targetLabel} · {fmtDM(newCheckIn)} — {fmtDM(newCheckOut)}
    </div>
  );
}

/** Всплывающая карточка при наведении на бронь (эталон Bnovo). Позиция подстраивается,
 *  чтобы карточка не обрезалась у нижней/правой границы окна (§2). */
function BookingTooltip({ hover, canPii }: { hover: Hover; canPii: boolean }) {
  const b = hover.booking;
  const sm = statusMeta(b.status);
  const paid = paidAmount(b);
  const total = b.totalPrice + b.extrasTotal;
  const bal = balanceBadge(b, todayIso());
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: hover.x + 16, top: hover.y + 16 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, M = 12;
    // По горизонтали — слева от курсора, если справа не помещается.
    let left = hover.x + 16;
    if (left + width + M > vw) left = Math.max(M, hover.x - width - 16);
    // По вертикали — прижимаем к экрану целиком (не обрезаем снизу); при нехватке — выше курсора.
    let top = hover.y + 16;
    if (top + height + M > vh) top = Math.max(M, Math.min(hover.y - height - 16, vh - height - M));
    setPos({ left, top });
  }, [hover.x, hover.y, b.id]);
  return (
    <div ref={ref} className="pointer-events-none fixed z-[60] max-h-[calc(100vh-24px)] w-80 overflow-auto rounded-xl border border-ink/10 bg-white p-4 text-sm shadow-2xl" style={{ left: pos.left, top: pos.top }}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${sm.badge}`}>{sm.label}</span>
        <span className="text-ink">{b.bookingNumber ?? ''}</span>
      </div>
      <div className="mb-2 flex items-center justify-between rounded-md bg-ink/5 px-3 py-2 text-xs">
        <div>{new Date(b.checkIn).toLocaleDateString('ru-RU')}<br /><span className="text-dark-gray">{b.arrivalTime ?? ''}</span></div>
        <div className="text-center font-medium text-ink">{b.nights}<br /><span className="text-dark-gray">ноч.</span></div>
        <div className="text-right">{new Date(b.checkOut).toLocaleDateString('ru-RU')}<br /><span className="text-dark-gray">{b.departureTime ?? ''}</span></div>
      </div>
      <Line label="Заказчик" value={canPii ? guestName(b) : 'Гость (нет доступа к ПДн)'} />
      {b.guest?.phone ? <Line label="" value={formatPhoneDisplay(b.guest.phone)} /> : null}
      {b.guest?.email ? <Line label="" value={b.guest.email} /> : null}
      <Line label="Кол-во гостей" value={`${b.adults ?? b.guests} взр${b.children ? ` · ${b.children} дет` : ''}`} />
      <Line label="Источник" value={b.channel} />
      <div className="my-2 border-t border-ink/10" />
      <Line label="Общая сумма" value={money(total)} />
      <Line label="Оплачено" value={money(paid)} />
      <Line label="Остаток к оплате" value={money(Math.max(0, total - paid))} />
      {bal ? <div className="mt-1 flex justify-between"><span className="text-dark-gray">Баланс клиента</span><span className={bal.kind === 'green' ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>{bal.kind === 'green' ? '+' : '−'}{money(bal.amount)}</span></div> : null}
      {b.comment ? <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/70 px-2.5 py-1.5"><p className="text-[10px] font-medium uppercase tracking-wide text-amber-800">Примечание</p><p className="whitespace-pre-line text-xs text-ink">{b.comment}</p></div> : null}
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 py-0.5"><span className="text-dark-gray">{label}</span><span className="text-right text-ink">{value}</span></div>;
}
