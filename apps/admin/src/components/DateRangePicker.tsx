'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const fmt = (s: string) => (s ? s.split('-').reverse().join('.') : '');

/**
 * Современный выпадающий выбор периода (эталон Bnovo): большая сетка месяца,
 * подсветка выбранного диапазона и предпросмотр при наведении курсора.
 *
 * КОНВЕНЦИЯ ПРОЕКТА (§5): все календари в админке — это DateRangePicker (период)
 * или {@link DatePicker} (одна дата), а НЕ нативный input[type=date]. Любой новый
 * календарь должен выглядеть так же — большим и единообразным.
 */
export function DateRangePicker({ from, to, onChange, className, placeholder = 'Выберите период' }: {
  from: string; to: string; onChange: (from: string, to: string) => void; className?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(() => {
    const base = from || to || new Date().toISOString().slice(0, 10);
    const p = base.split('-');
    return { y: Number(p[0]), m: Number(p[1]) - 1 };
  });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setHover(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const cells = useMemo(() => {
    const startWd = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7; // Пн=0
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const arr: (string | null)[] = Array.from({ length: startWd }, () => null);
    for (let d = 1; d <= days; d++) arr.push(isoOf(view.y, view.m, d));
    return arr;
  }, [view]);

  const rangeEnd = to || (from && hover && hover >= from ? hover : '');
  const inRange = (day: string) => Boolean(from && rangeEnd && day > from && day < rangeEnd);

  const pick = (day: string) => {
    if (!from || (from && to)) onChange(day, '');            // начинаем новый диапазон
    else if (day < from) onChange(day, '');                  // клик раньше начала — сброс на новое начало
    else { onChange(from, day); setOpen(false); setHover(''); }
  };
  const shift = (delta: number) => setView((v) => {
    const m = v.m + delta;
    return m < 0 ? { y: v.y - 1, m: 11 } : m > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m };
  });

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink hover:border-ink/40">
        <span className={from ? '' : 'text-dark-gray'}>{from ? `${fmt(from)} — ${to ? fmt(to) : '…'}` : placeholder}</span>
        <span className="text-ink/40">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[336px] rounded-xl border border-ink/10 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} className="h-8 w-8 rounded-md text-lg text-ink hover:bg-ink/5">‹</button>
            <span className="text-sm font-medium text-ink">{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} className="h-8 w-8 rounded-md text-lg text-ink hover:bg-ink/5">›</button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] text-dark-gray">{WD.map((w) => <div key={w}>{w}</div>)}</div>
          <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => setHover('')}>
            {cells.map((day, i) => day === null ? <div key={i} /> : (
              <button key={day} type="button" onMouseEnter={() => setHover(day)} onClick={() => pick(day)}
                className={`h-9 rounded-md text-sm transition ${day === from || day === to ? 'bg-ink font-medium text-beige' : inRange(day) ? 'bg-ink/15 text-ink' : 'text-ink hover:bg-ink/10'}`}>
                {Number(day.slice(8))}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <button type="button" onClick={() => { onChange('', ''); setHover(''); }} className="text-dark-gray hover:text-ink">Очистить</button>
            <button type="button" onClick={() => { setOpen(false); setHover(''); }} className="font-medium text-ink">Готово</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
