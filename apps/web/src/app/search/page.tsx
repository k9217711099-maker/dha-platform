'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { AmenityIcon } from '../../lib/amenity-icons';
import type { FiltersMeta, PropertySearchResult, RatePlan, RoomAvailability, SearchInput } from '../../lib/api-types';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
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

/** Компактный фильтр-«таблетка» с выпадающим списком чекбоксов. */
function FilterDropdown({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
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
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
          count > 0 ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink hover:border-ink/40'
        }`}
      >
        {label}{count > 0 ? ` · ${count}` : ''}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-[22rem] w-64 overflow-y-auto rounded-xl border border-ink/15 bg-white p-2 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}

/** Меню «Поделиться»: скопировать ссылку и (если доступно) системный шэринг. */
function ShareMenu({
  onCopy,
  onShare,
  canShare,
  copied,
}: {
  onCopy: () => void;
  onShare: () => void;
  canShare: boolean;
  copied: boolean;
}) {
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
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink hover:bg-beige">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
        {copied ? 'Ссылка скопирована' : 'Поделиться'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-ink/15 bg-white p-1.5 shadow-xl">
          <button
            onClick={() => { onCopy(); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-beige/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
            Скопировать ссылку
          </button>
          {canShare && (
            <button
              onClick={() => { onShare(); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-beige/60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 15V3M8 7l4-4 4 4" /></svg>
              Поделиться…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Строка-опция чекбокса с необязательной иконкой (для удобств). */
function OptionRow({
  checked,
  onChange,
  icon,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-beige/60">
      <input type="checkbox" checked={checked} onChange={onChange} className="shrink-0" />
      {icon ? <span className="shrink-0 text-dark-gray">{icon}</span> : null}
      <span className="flex-1">{children}</span>
    </label>
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

  // Ближайшая ночь (сегодня→завтра) — для предварительных цен, пока гость не выбрал даты.
  const { defaultCheckIn, defaultCheckOut } = useMemo(() => {
    const ymd = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const now = new Date();
    return { defaultCheckIn: ymd(now), defaultCheckOut: ymd(new Date(now.getTime() + 86_400_000)) };
  }, []);
  const effCheckIn = checkIn || defaultCheckIn;
  const effCheckOut = checkOut || defaultCheckOut;

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
        // Без выбранных дат: каталог целиком + предварительные цены на ближайшую ночь.
        // Каталог (browse) держит ВСЕ категории; превью-поиск на сегодня→завтра
        // подмешивает цены в те, что свободны, — остальные остаются «Выберите даты».
        const all = await api.browse({ propertyTypes, districts, amenities, features });
        const preview = await api
          .search({ checkIn: defaultCheckIn, checkOut: defaultCheckOut, guests: primary.adults, children: primary.children, propertyTypes, districts, amenities, features, priceRanges })
          .catch(() => [] as PropertySearchResult[]);
        const rateByRt = new Map<string, RatePlan[]>();
        for (const p of preview) for (const r of p.rooms) if (r.ratePlans.length) rateByRt.set(r.roomTypeId, r.ratePlans);
        res = all.map((p) => ({
          ...p,
          rooms: p.rooms.map((r) => (rateByRt.has(r.roomTypeId) ? { ...r, ratePlans: rateByRt.get(r.roomTypeId)! } : r)),
        }));
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
      checkIn: effCheckIn,
      checkOut: effCheckOut,
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
    checkIn: effCheckIn,
    checkOut: effCheckOut,
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
    ymGoal('filter_reset');
  }

  // Переключение фильтра + метрика (считаем, чем пользуются гости).
  const flip =
    (kind: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
      setter((s) => toggle(s, value));
      ymGoal('filter_apply', { kind, value });
    };
  const toggleType = flip('bedrooms', setTypes);
  const togglePrice = flip('price', setPriceRanges);
  const toggleAmenity = flip('amenity', setAmenities);
  const toggleDistrict = flip('district', setDistricts);
  const toggleFeature = flip('feature', setFeatures);

  const priceLabel = (r: { code: string; indicator: string; minRub: number; maxRub: number | null }) =>
    `${r.indicator} ${r.minRub.toLocaleString('ru')}${r.maxRub ? `–${r.maxRub.toLocaleString('ru')}` : '+'} ₽`;

  // --- Ссылка на выдачу: синхронизация состояния поиска с URL (#шаринг) ---
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const p = new URLSearchParams(window.location.search);
    const csv = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : []);
    if (p.get('ci')) setCheckIn(p.get('ci')!);
    if (p.get('co')) setCheckOut(p.get('co')!);
    const a = Number(p.get('a')) || 0;
    const c = Number(p.get('c')) || 0;
    if (a || c) setRooms([{ adults: a || 2, children: c }]);
    if (p.get('promo')) setPromo(p.get('promo')!);
    if (csv('pt').length) setTypes(csv('pt'));
    if (csv('d').length) setDistricts(csv('d'));
    if (csv('am').length) setAmenities(csv('am'));
    if (csv('f').length) setFeatures(csv('f'));
    if (csv('pr').length) setPriceRanges(csv('pr'));
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const p = new URLSearchParams();
    if (checkIn) p.set('ci', checkIn);
    if (checkOut) p.set('co', checkOut);
    if (primary.adults !== 2) p.set('a', String(primary.adults));
    if (primary.children) p.set('c', String(primary.children));
    if (promo) p.set('promo', promo);
    if (propertyTypes.length) p.set('pt', propertyTypes.join(','));
    if (districts.length) p.set('d', districts.join(','));
    if (amenities.length) p.set('am', amenities.join(','));
    if (features.length) p.set('f', features.join(','));
    if (priceRanges.length) p.set('pr', priceRanges.join(','));
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [checkIn, checkOut, primary.adults, primary.children, promo, propertyTypes, districts, amenities, features, priceRanges]);

  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function copyLink() {
    ymGoal('share_link', { method: 'copy', filters: activeFilters, hasDates });
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* буфер недоступен (не-HTTPS/старый браузер) — покажем всё равно «скопировано» по best-effort */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    ymGoal('share_link', { method: 'native', filters: activeFilters, hasDates });
    try {
      const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
      if (nav.share) await nav.share({ title: 'D Hotels & Apartments', url: window.location.href });
      else await copyLink();
    } catch {
      /* пользователь отменил шаринг — это не ошибка */
    }
  }

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

      {/* Ключевые фильтры (выпадающие) + все фильтры + поделиться */}
      {filters && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FilterDropdown label="Спальни" count={propertyTypes.length}>
            {filters.propertyTypes.map((t) => (
              <OptionRow key={t.value} checked={propertyTypes.includes(t.value)} onChange={() => toggleType(t.value)}>{t.label}</OptionRow>
            ))}
          </FilterDropdown>
          <FilterDropdown label="Цена" count={priceRanges.length}>
            {filters.priceRanges.map((r) => (
              <OptionRow key={r.code} checked={priceRanges.includes(r.code)} onChange={() => togglePrice(r.code)}>{priceLabel(r)}</OptionRow>
            ))}
          </FilterDropdown>
          <FilterDropdown label="Удобства" count={amenities.length}>
            {filters.amenityCategories.map((cat) => (
              <div key={cat.value} className="border-t border-ink/10 pt-2 first:border-0 first:pt-0">
                <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-dark-gray">{cat.label}</p>
                {cat.items.map((i) => (
                  <OptionRow
                    key={i.code}
                    checked={amenities.includes(i.code)}
                    onChange={() => toggleAmenity(i.code)}
                    icon={<AmenityIcon label={i.label} icon={i.icon} code={i.code} className="h-4 w-4" />}
                  >
                    {i.label}
                  </OptionRow>
                ))}
              </div>
            ))}
          </FilterDropdown>

          <button onClick={() => { setFiltersOpen(true); ymGoal('filter_open'); }} className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink hover:bg-beige">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Все фильтры{activeFilters > 0 ? ` · ${activeFilters}` : ''}
          </button>
          <ShareMenu onCopy={() => void copyLink()} onShare={() => void shareLink()} canShare={canShare} copied={copied} />
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
          Цены показаны <b className="text-ink">на ближайшую ночь</b> (сегодня–завтра). Выберите свои <b className="text-ink">даты заезда и выезда</b> — увидите точные цены и тарифы под них.
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
              soloInProperty={p.rooms.length === 1}
              pricePreview={!hasDates}
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
              <CheckGroup title="Тип объекта" options={filters.propertyTypes} selected={propertyTypes} onToggle={toggleType} />
              <CheckGroup title="Район" options={filters.districts} selected={districts} onToggle={toggleDistrict} />
              <CheckGroup title="Цена за ночь" options={filters.priceRanges.map((r) => ({ value: r.code, label: priceLabel(r) }))} selected={priceRanges} onToggle={togglePrice} />
              {filters.amenityCategories.map((cat) => (
                <CheckGroup key={cat.value} title={`Удобства · ${cat.label}`} options={cat.items.map((i) => ({ value: i.code, label: i.label }))} selected={amenities} onToggle={toggleAmenity} />
              ))}
              <CheckGroup title="Характеристики" options={filters.features.map((f) => ({ value: f.code, label: f.label }))} selected={features} onToggle={toggleFeature} />
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
