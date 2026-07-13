'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { CalendarDay } from '../lib/api-types';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
/** Понедельник=0 … воскресенье=6. */
function mondayIdx(date: Date): number {
  return (date.getDay() + 6) % 7;
}
function ruShort(s: string): string {
  const d = fromIso(s);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  propertyId?: string;
  roomTypeId?: string;
  guests?: number;
  children?: number;
}

/** Пикер дат с двухмесячным календарём: доступность цветом + цена за ночь в ячейке. */
export function DateRangeCalendar({
  checkIn,
  checkOut,
  onChange,
  propertyId,
  roomTypeId,
  guests,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [baseOffset, setBaseOffset] = useState(0); // смещение левого месяца от текущего
  const [days, setDays] = useState<Map<string, CalendarDay>>(new Map());
  const [pendingIn, setPendingIn] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Загрузка календаря цен на ~3 месяца вперёд
  useEffect(() => {
    if (!open) return;
    const today = new Date();
    api
      .getPriceCalendar({ from: iso(today), days: 92, propertyId, roomTypeId, guests, children })
      .then((list) => setDays(new Map(list.map((d) => [d.date, d]))))
      .catch(() => undefined);
  }, [open, propertyId, roomTypeId, guests, children]);

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const todayIso = iso(new Date());

  function pick(dateIso: string) {
    if (dateIso < todayIso) return;
    const cell = days.get(dateIso);
    if (cell && !cell.available) return;
    if (!pendingIn) {
      setPendingIn(dateIso);
      return;
    }
    if (dateIso <= pendingIn) {
      setPendingIn(dateIso);
      return;
    }
    onChange(pendingIn, dateIso);
    setPendingIn(null);
    setOpen(false);
  }

  const months = useMemo(() => {
    const now = new Date();
    return [0, 1].map((i) => {
      const m = new Date(now.getFullYear(), now.getMonth() + baseOffset + i, 1);
      return { year: m.getFullYear(), month: m.getMonth() };
    });
  }, [baseOffset]);

  const rangeStart = pendingIn ?? checkIn;
  const rangeEnd = pendingIn ? null : checkOut;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-left text-sm hover:border-ink/40"
      >
        <span>
          <span className="block text-xs text-dark-gray">Заезд — выезд</span>
          <span className="text-ink">
            {checkIn && checkOut ? `${ruShort(checkIn)} — ${ruShort(checkOut)}` : 'Выберите даты'}
          </span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-dark-gray">
          <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,640px)] rounded-xl border border-ink/15 bg-white p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setBaseOffset((o) => Math.max(0, o - 1))}
              disabled={baseOffset === 0}
              className="rounded-md px-2 py-1 text-ink hover:bg-beige disabled:opacity-30"
            >
              ‹
            </button>
            <p className="text-xs text-dark-gray">
              {pendingIn ? 'Выберите дату выезда' : 'Выберите дату заезда'}
            </p>
            <button
              type="button"
              onClick={() => setBaseOffset((o) => Math.min(2, o + 1))}
              disabled={baseOffset >= 2}
              className="rounded-md px-2 py-1 text-ink hover:bg-beige disabled:opacity-30"
            >
              ›
            </button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {months.map(({ year, month }) => (
              <div key={`${year}-${month}`}>
                <p className="mb-2 text-center text-sm font-medium text-ink">
                  {MONTHS[month]} {year}
                </p>
                <div className="mb-1 grid grid-cols-7 gap-0.5">
                  {WEEKDAYS.map((w, wi) => (
                    <span key={w} className={`text-center text-[10px] ${wi === 4 || wi === 5 ? 'font-semibold text-amber-700' : 'text-dark-gray'}`}>{w}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: mondayIdx(new Date(year, month, 1)) }).map((_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {Array.from({ length: new Date(year, month + 1, 0).getDate() }).map((_, i) => {
                    const date = new Date(year, month, i + 1);
                    const di = iso(date);
                    const cell = days.get(di);
                    const past = di < todayIso;
                    const closed = (cell && !cell.available) || past;
                    const inRange = rangeStart && rangeEnd && di >= rangeStart && di <= rangeEnd;
                    const isEdge = di === rangeStart || di === rangeEnd;
                    const dow = mondayIdx(date); // Пн=0 … Пт=4, Сб=5
                    const weekend = dow === 4 || dow === 5;
                    return (
                      <button
                        key={di}
                        type="button"
                        disabled={closed}
                        onClick={() => pick(di)}
                        className={[
                          'flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] leading-none transition-colors',
                          closed
                            ? 'cursor-not-allowed text-dark-gray/30 line-through'
                            : 'cursor-pointer hover:bg-ink/5',
                          isEdge ? '!bg-ink text-white' : '',
                          inRange && !isEdge ? 'bg-beige' : '',
                          weekend && !isEdge && !inRange && !closed ? 'bg-amber-50' : '',
                        ].join(' ')}
                      >
                        <span className={`text-[13px] ${isEdge ? 'font-semibold text-white' : weekend ? 'font-semibold text-ink' : 'text-ink'}`}>
                          {i + 1}
                        </span>
                        {cell?.minNightlyPrice != null && !past && (
                          <span
                            className={`whitespace-nowrap text-[9px] ${
                              isEdge ? 'text-white/85' : weekend ? 'font-semibold text-amber-700' : 'text-dark-gray'
                            }`}
                          >
                            {cell.minNightlyPrice.toLocaleString('ru')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-ink/10 pt-3 text-[11px] text-dark-gray">
            <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-beige" /> свободно</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-ink/10" /> закрыто</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-amber-50 ring-1 ring-amber-200" /> пт/сб</span>
            <span className="ml-auto">цена — за ночь, ₽</span>
          </div>
        </div>
      )}
    </div>
  );
}
