'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useCart, type CartExtra } from '../../lib/cart-context';
import { ymGoal } from '../../lib/metrika';
import { DateRangeCalendar } from '../../components/DateRangeCalendar';
import { OccupancyPicker, type RoomOccupancy } from '../../components/OccupancyPicker';
import { RoomResultCard, type SearchCtx } from '../../components/RoomResultCard';
import { RoomDetailsModal } from '../../components/RoomDetailsModal';
import { TariffModal } from '../../components/TariffModal';
import { YandexMap } from '../../components/YandexMap';
import type { FiltersMeta, PropertySearchResult, RoomAvailability, SearchInput } from '../../lib/api-types';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink hover:border-ink/40'
      }`}
    >
      {children}
    </button>
  );
}

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="border-t border-ink/10 py-4 first:border-0 first:pt-0">
      <h3 className="mb-2 text-sm font-medium text-ink">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-dark-gray">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  const { guest } = useAuth();
  const cart = useCart();
  const [filters, setFilters] = useState<FiltersMeta | null>(null);
  const [results, setResults] = useState<PropertySearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState<RoomOccupancy[]>([{ adults: 2, children: 0 }]);
  const [promo, setPromo] = useState('');
  const [propertyTypes, setTypes] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [priceRanges, setPriceRanges] = useState<string[]>([]);
  const [favIds, setFavIds] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapRoom, setMapRoom] = useState<{ room: RoomAvailability; propertyName: string } | null>(null);

  // Esc закрывает панель фильтров и карту
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (filtersOpen) setFiltersOpen(false);
      else if (showMap && !mapRoom) setShowMap(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtersOpen, showMap, mapRoom]);

  function openMapRoom(propertyId: string, roomTypeId: string) {
    const p = results?.find((x) => x.propertyId === propertyId);
    const room = p?.rooms.find((r) => r.roomTypeId === roomTypeId);
    if (p && room) setMapRoom({ room, propertyName: p.name });
  }

  useEffect(() => {
    api.getFilters().then(setFilters).catch(() => setError('Не удалось загрузить фильтры'));
  }, []);

  useEffect(() => {
    if (guest) api.favoriteIds().then(setFavIds).catch(() => setFavIds([]));
    else setFavIds([]);
  }, [guest]);

  async function toggleFavorite(roomTypeId: string) {
    const isFav = favIds.includes(roomTypeId);
    setFavIds((s) => (isFav ? s.filter((x) => x !== roomTypeId) : [...s, roomTypeId]));
    try {
      if (isFav) await api.removeFavorite(roomTypeId);
      else await api.addFavorite(roomTypeId);
    } catch {
      setFavIds((s) => (isFav ? [...s, roomTypeId] : s.filter((x) => x !== roomTypeId)));
    }
  }

  const primary = rooms[0] ?? { adults: 2, children: 0 };

  const hasDates = !!(checkIn && checkOut);

  const runSearch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let res: PropertySearchResult[];
      if (checkIn && checkOut) {
        const body: SearchInput = {
          checkIn,
          checkOut,
          guests: primary.adults,
          children: primary.children,
          propertyTypes,
          districts,
          amenities,
          features,
          priceRanges,
        };
        res = await api.search(body);
        ymGoal('search', { checkIn, checkOut, rooms: rooms.length, adults: primary.adults, children: primary.children, found: res.length });
      } else {
        // Без дат — каталог целиком (цены появятся после выбора дат)
        res = await api.browse({ propertyTypes, districts, amenities, features });
      }
      setResults(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, rooms, propertyTypes, districts, amenities, features, priceRanges]);

  const first = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => void runSearch(), first.current ? 0 : 350);
    first.current = false;
    return () => clearTimeout(t);
  }, [runSearch]);

  function addToCart(room: RoomAvailability, ratePlanId: string, extras: CartExtra[] = []) {
    const rate = room.ratePlans.find((r) => r.id === ratePlanId) ?? room.ratePlans[0];
    if (!rate) return;
    cart.add({
      propertyId: room.propertyId,
      propertyName: room.propertyName,
      roomTypeId: room.roomTypeId,
      roomTypeName: room.roomTypeName,
      ratePlanId: rate.id,
      ratePlanName: rate.name,
      perNight: rate.perNight,
      totalPrice: rate.totalPrice,
      photo: room.photos[0] ?? null,
      checkIn,
      checkOut,
      guests: primary.adults,
      children: primary.children,
      roomsCount: 1,
      extras,
      extrasTotal: extras.reduce((s, e) => s + e.total, 0),
    });
  }

  const cashback = filters?.registrationCashbackPercent ?? 3;
  const isGuest = !!guest;
  const amenityLabels: Record<string, string> = {};
  filters?.amenityCategories.forEach((c) => c.items.forEach((i) => { amenityLabels[i.code] = i.label; }));
  const ctx: SearchCtx = {
    checkIn,
    checkOut,
    guests: primary.adults,
    childrenCount: primary.children,
    onDatesChange: (ci, co) => {
      setCheckIn(ci);
      setCheckOut(co);
    },
  };

  const activeFilters = propertyTypes.length + districts.length + amenities.length + features.length + priceRanges.length;
  function resetFilters() {
    setTypes([]);
    setDistricts([]);
    setAmenities([]);
    setFeatures([]);
    setPriceRanges([]);
  }
  const priceLabel = (r: { code: string; indicator: string; minRub: number; maxRub: number | null }) =>
    `${r.indicator} ${r.minRub.toLocaleString('ru')}${r.maxRub ? `–${r.maxRub.toLocaleString('ru')}` : '+'} ₽`;

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-8">
      <h1 className="mb-5 text-3xl font-light text-ink">Поиск проживания</h1>

      {/* Строка поиска */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DateRangeCalendar checkIn={checkIn} checkOut={checkOut} onChange={(ci, co) => { setCheckIn(ci); setCheckOut(co); }} guests={primary.adults} children={primary.children} />
        <OccupancyPicker rooms={rooms} onChange={setRooms} />
        <div>
          <label htmlFor="promo" className="mb-1 block text-xs text-dark-gray">Промокод</label>
          <input id="promo" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="например, WELCOME10" className="w-full rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-dark-gray/50 focus:border-ink/40 focus:outline-none" />
        </div>
        <div className="flex items-end">
          <Button onClick={() => void runSearch()} disabled={busy} className="w-full">{busy ? 'Ищем…' : 'Найти'}</Button>
        </div>
      </div>

      {/* Популярные фильтры + кнопка «Фильтры» */}
      {filters && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {filters.propertyTypes.map((t) => (
            <Chip key={t.value} active={propertyTypes.includes(t.value)} onClick={() => setTypes((s) => toggle(s, t.value))}>{t.label}</Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-ink/15" />
          {filters.priceRanges.map((r) => (
            <Chip key={r.code} active={priceRanges.includes(r.code)} onClick={() => setPriceRanges((s) => toggle(s, r.code))}>{r.indicator}</Chip>
          ))}
          <button onClick={() => setFiltersOpen(true)} className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink hover:bg-beige">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Фильтры{activeFilters > 0 ? ` · ${activeFilters}` : ''}
          </button>
          {activeFilters > 0 && (
            <button onClick={resetFilters} className="text-sm text-dark-gray underline hover:text-ink">сбросить</button>
          )}
        </div>
      )}

      {!isGuest && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-beige px-4 py-3">
          <p className="text-sm text-ink">Зарегистрируйтесь и получайте <b>{cashback}% кэшбэка</b> баллами с каждого прямого бронирования.</p>
          <a href="/register" onClick={() => ymGoal('register_click')} className="rounded-lg bg-ink px-4 py-1.5 text-sm text-white">Регистрация</a>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      {!hasDates && (
        <div className="mt-5 rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-dark-gray">
          Показаны все варианты. Выберите <b className="text-ink">даты заезда и выезда</b> — появятся цены, тарифы и бронирование.
        </div>
      )}

      {/* Заголовок результатов + карта */}
      <div className="mb-4 mt-6 flex items-center justify-between">
        <p className="text-sm text-dark-gray">
          {results === null
            ? ''
            : `Найдено: ${results.length} объектов · ${results.reduce((s, p) => s + p.rooms.length, 0)} вариантов`}
        </p>
        {results && results.length > 0 && (
          <button onClick={() => setShowMap(true)} className="flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink hover:bg-beige">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" /></svg>
            Показать на карте
          </button>
        )}
      </div>

      {results === null && <p className="text-dark-gray">Загрузка…</p>}
      {results?.length === 0 && <p className="text-dark-gray">Ничего не найдено. Измените даты или фильтры.</p>}

      {/* Все категории в общей сетке (заполняет ширину) */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results?.flatMap((p) =>
          p.rooms.map((room) => (
            <RoomResultCard
              key={room.roomTypeId}
              room={room}
              propertyName={p.name}
              propertyType={p.type}
              cashbackPercent={cashback}
              isGuest={isGuest}
              ctx={ctx}
              amenityLabels={amenityLabels}
              onAdd={addToCart}
              isFavorite={favIds.includes(room.roomTypeId)}
              onToggleFavorite={() => void toggleFavorite(room.roomTypeId)}
              onOpenDetails={() => ymGoal('view_room', { room: room.roomTypeName })}
              onSelect={() => ymGoal('select_room', { room: room.roomTypeName })}
            />
          )),
        )}
      </div>

      {/* Панель всех фильтров */}
      {filtersOpen && filters && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setFiltersOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4">
              <h2 className="text-lg text-ink">Фильтры{activeFilters > 0 ? ` · ${activeFilters}` : ''}</h2>
              <button onClick={() => setFiltersOpen(false)} className="text-2xl leading-none text-dark-gray hover:text-ink" aria-label="Закрыть">×</button>
            </div>
            <div className="px-5 py-3">
              <CheckGroup title="Тип объекта" options={filters.propertyTypes} selected={propertyTypes} onToggle={(v) => setTypes((s) => toggle(s, v))} />
              <CheckGroup title="Район" options={filters.districts} selected={districts} onToggle={(v) => setDistricts((s) => toggle(s, v))} />
              <CheckGroup title="Цена за ночь" options={filters.priceRanges.map((r) => ({ value: r.code, label: priceLabel(r) }))} selected={priceRanges} onToggle={(v) => setPriceRanges((s) => toggle(s, v))} />
              {filters.amenityCategories.map((cat) => (
                <CheckGroup key={cat.value} title={`Удобства · ${cat.label}`} options={cat.items.map((i) => ({ value: i.code, label: i.label }))} selected={amenities} onToggle={(v) => setAmenities((s) => toggle(s, v))} />
              ))}
              <CheckGroup title="Характеристики" options={filters.features.map((f) => ({ value: f.code, label: f.label }))} selected={features} onToggle={(v) => setFeatures((s) => toggle(s, v))} />
            </div>
            <div className="sticky bottom-0 flex gap-3 border-t border-ink/10 bg-white px-5 py-3">
              <Button variant="secondary" onClick={resetFilters} className="flex-1">Сбросить</Button>
              <Button onClick={() => setFiltersOpen(false)} className="flex-1">Показать{results ? ` (${results.length})` : ''}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Карта на весь экран */}
      {showMap && results && results.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
            <span className="text-sm text-ink">Объекты на карте · {results.length}</span>
            <button onClick={() => setShowMap(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-dark-gray hover:bg-beige hover:text-ink" aria-label="Закрыть карту">×</button>
          </div>
          <div className="flex-1">
            <YandexMap properties={results} onSelectRoom={openMapRoom} />
          </div>
        </div>
      )}

      {/* Попап категории, открытый с карты (то же окно, что и в поиске) */}
      {mapRoom &&
        (mapRoom.room.ratePlans.length > 0 ? (
          <TariffModal
            room={mapRoom.room}
            propertyName={mapRoom.propertyName}
            cashbackPercent={cashback}
            isGuest={isGuest}
            ctx={ctx}
            onAdd={addToCart}
            onClose={() => setMapRoom(null)}
          />
        ) : (
          <RoomDetailsModal
            room={mapRoom.room}
            propertyName={mapRoom.propertyName}
            cashbackPercent={cashback}
            isGuest={isGuest}
            ctx={ctx}
            amenityLabels={amenityLabels}
            onAdd={addToCart}
            isFavorite={favIds.includes(mapRoom.room.roomTypeId)}
            onToggleFavorite={() => void toggleFavorite(mapRoom.room.roomTypeId)}
            onClose={() => setMapRoom(null)}
          />
        ))}
    </main>
  );
}
