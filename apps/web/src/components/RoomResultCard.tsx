'use client';

import { useRef, useState } from 'react';
import { Button } from '@dha/ui';
import type { RoomAvailability } from '../lib/api-types';
import type { CartExtra } from '../lib/cart-context';
import { Lightbox } from './Lightbox';
import { RoomDetailsModal } from './RoomDetailsModal';
import { TariffModal } from './TariffModal';

/** Короткая метка «спальни» по типу объекта. */
const BEDROOMS: Record<string, string> = {
  STUDIO: 'студия',
  ONE_BEDROOM: '1 спальня',
  TWO_BEDROOM: '2 спальни',
  THREE_BEDROOM: '3 спальни',
  HOTEL: 'номер',
  BOUTIQUE_HOTEL: 'номер',
};

function Heart({ filled }: { filled?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? '#e0245e' : 'none'} stroke={filled ? '#e0245e' : '#fff'} strokeWidth="2">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export interface SearchCtx {
  checkIn: string;
  checkOut: string;
  guests: number;
  childrenCount: number;
  onDatesChange: (checkIn: string, checkOut: string) => void;
}

interface Props {
  room: RoomAvailability;
  propertyName: string;
  propertyType: string;
  cashbackPercent: number;
  isGuest: boolean;
  ctx: SearchCtx;
  amenityLabels?: Record<string, string>;
  onAdd: (room: RoomAvailability, ratePlanId: string, extras: CartExtra[]) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onOpenDetails?: () => void;
  onSelect?: () => void;
}

/** Карточка категории: крупное фото сверху, инфо снизу, выбор тарифа по «Выбрать». */
export function RoomResultCard({
  room,
  propertyName,
  propertyType,
  cashbackPercent,
  isGuest,
  ctx,
  amenityLabels,
  onAdd,
  isFavorite,
  onToggleFavorite,
  onOpenDetails,
  onSelect,
}: Props) {
  const photos = room.photos.length ? room.photos : [];
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [details, setDetails] = useState(false);
  const [tariffOpen, setTariffOpen] = useState(false);
  const touchX = useRef<number | null>(null);

  const cheapest = room.ratePlans.length ? room.ratePlans.reduce((a, b) => (a.perNight <= b.perNight ? a : b)) : null;
  const bedrooms = BEDROOMS[propertyType];

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (photos.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const seg = Math.floor(((e.clientX - rect.left) / rect.width) * photos.length);
    setIdx(Math.max(0, Math.min(photos.length - 1, seg)));
  }
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const endX = e.changedTouches[0]?.clientX;
    if (touchX.current == null || endX == null || photos.length < 2) return;
    const dx = endX - touchX.current;
    if (Math.abs(dx) > 30) setIdx((i) => (dx < 0 ? (i + 1) % photos.length : (i - 1 + photos.length) % photos.length));
    touchX.current = null;
  }

  function openDetails() {
    setDetails(true);
    onOpenDetails?.();
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white">
      {/* Фото — крупное, сверху */}
      <div
        className="relative aspect-[4/3] w-full cursor-pointer select-none bg-beige"
        onMouseMove={onMove}
        onMouseLeave={() => setIdx(0)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => photos.length && setLightbox(true)}
      >
        {photos.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[idx]} alt={room.roomTypeName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-dark-gray">нет фото</div>
        )}
        {!isGuest && (
          <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-1 text-[11px] font-medium text-white">
            Кэшбэк {cashbackPercent}% за регистрацию
          </span>
        )}
        {isGuest && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.();
            }}
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm transition hover:bg-black/55"
            aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
          >
            <Heart filled={isFavorite} />
          </button>
        )}
        {photos.length > 1 && (
          <div className="absolute inset-x-3 bottom-2 flex gap-1">
            {photos.map((_, i) => (
              <span key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>

      {/* Инфо — под фото */}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] uppercase tracking-wide text-dark-gray">{propertyName}</p>
        <button onClick={openDetails} className="group mt-0.5 flex items-start gap-1.5 text-left">
          <h3 className="text-base leading-tight text-ink group-hover:underline">{room.roomTypeName}</h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-dark-gray transition-transform group-hover:translate-x-0.5">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <p className="mt-1 text-sm text-dark-gray">
          до {room.capacity} гост.{room.areaSqm ? ` · ${room.areaSqm} м²` : ''}{bedrooms ? ` · ${bedrooms}` : ''}
        </p>

        <div className="mt-auto pt-3">
          {cheapest ? (
            <>
              <p className="text-lg text-ink">
                от {cheapest.perNight.toLocaleString('ru')} ₽<span className="text-xs text-dark-gray"> / ночь</span>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={openDetails} className="text-sm text-dark-gray underline hover:text-ink">Детали</button>
                <Button className="ml-auto" onClick={() => setTariffOpen(true)}>Выбрать</Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button onClick={openDetails} className="text-sm text-dark-gray underline hover:text-ink">Детали</button>
              <span className="text-xs text-dark-gray">Цены — по датам</span>
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <Lightbox photos={photos} index={idx} title={`${propertyName} · ${room.roomTypeName}`} onIndex={setIdx} onClose={() => setLightbox(false)} />
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
          }}
          onClose={() => setTariffOpen(false)}
        />
      )}
      {details && (
        <RoomDetailsModal
          room={room}
          propertyName={propertyName}
          cashbackPercent={cashbackPercent}
          isGuest={isGuest}
          ctx={ctx}
          amenityLabels={amenityLabels}
          onAdd={onAdd}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelect}
          onClose={() => setDetails(false)}
        />
      )}
    </div>
  );
}
