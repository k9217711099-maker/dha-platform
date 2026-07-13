'use client';

import { useEffect, useRef, useState } from 'react';

export interface RoomOccupancy {
  adults: number;
  children: number;
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-ink">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink hover:bg-beige disabled:opacity-30"
          aria-label={`${label}: меньше`}
        >
          −
        </button>
        <span className="w-5 text-center text-sm text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink hover:bg-beige disabled:opacity-30"
          aria-label={`${label}: больше`}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface Props {
  rooms: RoomOccupancy[];
  onChange: (rooms: RoomOccupancy[]) => void;
}

/** Пикер «Номера и гости»: несколько номеров, в каждом взрослые + дети. */
export function OccupancyPicker({ rooms, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const totalAdults = rooms.reduce((s, r) => s + r.adults, 0);
  const totalChildren = rooms.reduce((s, r) => s + r.children, 0);

  function patch(i: number, p: Partial<RoomOccupancy>) {
    onChange(rooms.map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  const addRoom = () => onChange([...rooms, { adults: 2, children: 0 }]);
  const removeRoom = (i: number) => onChange(rooms.filter((_, j) => j !== i));

  const summary =
    `${rooms.length} ${pluralRu(rooms.length, ['номер', 'номера', 'номеров'])}, ` +
    `${totalAdults} ${pluralRu(totalAdults, ['взрослый', 'взрослых', 'взрослых'])}` +
    (totalChildren > 0
      ? `, ${totalChildren} ${pluralRu(totalChildren, ['ребёнок', 'ребёнка', 'детей'])}`
      : '');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-left text-sm hover:border-ink/40"
      >
        <span>
          <span className="block text-xs text-dark-gray">Номера и гости</span>
          <span className="text-ink">{summary}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-dark-gray">
          <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 19v-1a4 4 0 0 0-3-3.87" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,360px)] rounded-xl border border-ink/15 bg-white p-4 shadow-2xl">
          {rooms.map((room, i) => (
            <div key={i} className="border-t border-ink/10 first:border-0">
              <div className="flex items-center justify-between pt-3">
                <span className="text-sm font-medium text-ink">Номер {i + 1}</span>
                {rooms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRoom(i)}
                    className="text-xs text-dark-gray underline hover:text-ink"
                  >
                    убрать
                  </button>
                )}
              </div>
              <Stepper label="Взрослые" value={room.adults} min={1} max={6} onChange={(v) => patch(i, { adults: v })} />
              <Stepper label="Дети" value={room.children} min={0} max={5} onChange={(v) => patch(i, { children: v })} />
            </div>
          ))}
          {rooms.length < 5 && (
            <button
              type="button"
              onClick={addRoom}
              className="mt-3 w-full rounded-lg border border-dashed border-ink/30 py-2 text-sm text-ink hover:bg-beige"
            >
              + Добавить номер
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-lg bg-ink py-2 text-sm text-white"
          >
            Готово
          </button>
        </div>
      )}
    </div>
  );
}
