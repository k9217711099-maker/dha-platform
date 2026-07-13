'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AMENITIES, AMENITY_CATEGORY_LABELS } from '@dha/domain';
import type { RoomAvailability } from '../lib/api-types';
import type { CartExtra } from '../lib/cart-context';
import { Lightbox } from './Lightbox';
import { DateRangeCalendar } from './DateRangeCalendar';
import { TariffModal } from './TariffModal';
import type { SearchCtx } from './RoomResultCard';

const amenityLabel = new Map(AMENITIES.map((a) => [a.code, a.label] as const));
const amenityCategory = new Map(AMENITIES.map((a) => [a.code, a.category] as const));

interface Props {
  room: RoomAvailability;
  propertyName: string;
  cashbackPercent: number;
  isGuest: boolean;
  ctx: SearchCtx;
  amenityLabels?: Record<string, string>;
  onAdd: (room: RoomAvailability, ratePlanId: string, extras: CartExtra[]) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onSelect?: () => void;
  onClose: () => void;
}

/** Модалка категории: фото, доступность дат, характеристики, удобства по блокам, бронь. */
export function RoomDetailsModal({
  room,
  propertyName,
  cashbackPercent,
  isGuest,
  ctx,
  amenityLabels,
  onAdd,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onClose,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  // Локальные даты календаря доступности — НЕ меняют даты на странице поиска
  const [calIn, setCalIn] = useState(ctx.checkIn);
  const [calOut, setCalOut] = useState(ctx.checkOut);
  const [tariffOpen, setTariffOpen] = useState(false);
  const photos = room.photos ?? [];

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !lightbox) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  const lbl = (code: string) => amenityLabels?.[code] ?? amenityLabel.get(code) ?? code;
  const groups = new Map<string, string[]>();
  for (const code of room.amenities) {
    const cat = amenityCategory.get(code) ?? 'other';
    const list = groups.get(cat) ?? [];
    list.push(lbl(code));
    groups.set(cat, list);
  }
  const allLabels = room.amenities.map((c) => lbl(c));
  const topLabels = allLabels.slice(0, 6);
  const cheapest = room.ratePlans.length ? room.ratePlans.reduce((a, b) => (a.perNight <= b.perNight ? a : b)) : null;

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Шапка */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-dark-gray">{propertyName}</p>
            <h2 className="text-xl text-ink">{room.roomTypeName}</h2>
          </div>
          <div className="flex items-center gap-3">
            {isGuest && (
              <button onClick={() => onToggleFavorite?.()} className="text-sm text-dark-gray hover:text-ink" aria-label="Избранное">
                {isFavorite ? '♥ В избранном' : '♡ В избранное'}
              </button>
            )}
            <button onClick={onClose} className="text-2xl leading-none text-dark-gray hover:text-ink" aria-label="Закрыть">×</button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Фото */}
          {photos.length > 0 && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[photo]}
                alt={room.roomTypeName}
                onClick={() => setLightbox(true)}
                className="h-56 w-full cursor-pointer rounded-xl object-cover"
              />
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p}
                    src={p}
                    alt=""
                    onClick={() => setPhoto(i)}
                    className={`h-14 w-20 shrink-0 cursor-pointer rounded-md object-cover transition ${i === photo ? 'ring-2 ring-ink' : 'opacity-70 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Кэшбэк за регистрацию */}
          {!isGuest && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-beige px-4 py-3">
              <p className="text-sm text-ink">
                Кэшбэк <b>{cashbackPercent}%</b> баллами за регистрацию — с каждого прямого бронирования.
              </p>
              <Link href="/register" className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm text-white">Регистрация</Link>
            </div>
          )}

          {/* Характеристики */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label="Вместимость" value={`до ${room.capacity} гостей`} />
            {room.areaSqm != null && <Fact label="Площадь" value={`${room.areaSqm} м²`} />}
            {room.bedType && <Fact label="Кровать" value={room.bedType} />}
          </div>

          {room.description && <p className="text-sm leading-relaxed text-dark-gray">{room.description}</p>}

          {/* Тарифы — выбор перед добавлением в подбор */}
          {room.ratePlans.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Тарифы</h3>
            <div className="space-y-2">
              {room.ratePlans.map((rp) => (
                <div key={rp.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 px-3 py-2">
                  <div>
                    <p className="text-sm text-ink">{rp.name}</p>
                    <p className="text-xs text-dark-gray">{rp.cancellationPolicy}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-ink">{rp.perNight.toLocaleString('ru')} ₽<span className="text-[11px] text-dark-gray">/ночь</span></p>
                    <button
                      onClick={() => setTariffOpen(true)}
                      className="mt-1 rounded-md bg-ink px-3 py-1 text-xs text-white hover:opacity-90"
                    >
                      Выбрать
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Доступность дат именно этой категории (price-calendar по roomTypeId) */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">Доступность и цены — «{room.roomTypeName}»</h3>
            <p className="mb-2 text-xs text-dark-gray">
              Календарь показывает свободные даты и цену за ночь именно для этой категории. Закрытые дни — серым.
            </p>
            <DateRangeCalendar
              checkIn={calIn}
              checkOut={calOut}
              onChange={(ci, co) => {
                setCalIn(ci);
                setCalOut(co);
              }}
              roomTypeId={room.roomTypeId}
              guests={ctx.guests}
              children={ctx.childrenCount}
            />
          </div>

          {/* Удобства */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Удобства</h3>
            {!showAll ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {topLabels.map((l) => (
                    <span key={l} className="rounded-md bg-beige px-2.5 py-1 text-xs text-ink">{l}</span>
                  ))}
                </div>
                {allLabels.length > topLabels.length && (
                  <button onClick={() => setShowAll(true)} className="mt-3 text-sm text-ink underline hover:no-underline">
                    Подробнее — все удобства ({allLabels.length})
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {[...groups.entries()].map(([cat, items]) => (
                  <div key={cat}>
                    <p className="mb-1.5 text-xs uppercase tracking-wide text-dark-gray">
                      {AMENITY_CATEGORY_LABELS[cat as keyof typeof AMENITY_CATEGORY_LABELS] ?? cat}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((l) => (
                        <span key={l} className="rounded-md border border-ink/15 px-2.5 py-1 text-xs text-dark-gray">{l}</span>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={() => setShowAll(false)} className="text-sm text-ink underline hover:no-underline">Свернуть</button>
              </div>
            )}
          </div>
        </div>

        {/* Подвал: цена */}
        <div className="sticky bottom-0 flex items-center justify-between border-t border-ink/10 bg-white px-6 py-3">
          {cheapest ? (
            <>
              <span className="text-sm text-dark-gray">
                от <b className="text-ink">{cheapest.perNight.toLocaleString('ru')} ₽</b> / ночь
              </span>
              <span className="text-xs text-dark-gray">Выберите тариф в блоке «Тарифы»</span>
            </>
          ) : (
            <span className="text-sm text-dark-gray">Выберите даты заезда и выезда, чтобы увидеть цены и тарифы</span>
          )}
        </div>
      </div>

      {lightbox && (
        <Lightbox photos={photos} index={photo} title={`${propertyName} · ${room.roomTypeName}`} onIndex={setPhoto} onClose={() => setLightbox(false)} />
      )}
      {tariffOpen && (
        <TariffModal
          room={room}
          propertyName={propertyName}
          cashbackPercent={cashbackPercent}
          isGuest={isGuest}
          ctx={ctx}
          onAdd={(r, id, ex) => {
            onAdd(r, id, ex);
            onSelect?.();
            onClose();
          }}
          onClose={() => setTariffOpen(false)}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/10 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-dark-gray">{label}</p>
      <p className="text-sm text-ink">{value}</p>
    </div>
  );
}
