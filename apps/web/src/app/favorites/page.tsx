'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useCart, type CartExtra } from '../../lib/cart-context';
import { ymGoal } from '../../lib/metrika';
import { DateRangeCalendar } from '../../components/DateRangeCalendar';
import { OccupancyPicker, type RoomOccupancy } from '../../components/OccupancyPicker';
import { RoomResultCard, type SearchCtx } from '../../components/RoomResultCard';
import type { FavoriteView, FiltersMeta, PropertySearchResult, RoomAvailability } from '../../lib/api-types';

interface Avail {
  room: RoomAvailability;
  propertyName: string;
  propertyType: string;
}

export default function FavoritesPage() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const cart = useCart();
  const [items, setItems] = useState<FavoriteView[] | null>(null);
  const [filters, setFilters] = useState<FiltersMeta | null>(null);

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState<RoomOccupancy[]>([{ adults: 2, children: 0 }]);
  const [availMap, setAvailMap] = useState<Map<string, Avail>>(new Map());
  const [busy, setBusy] = useState(false);

  const primary = rooms[0] ?? { adults: 2, children: 0 };
  const hasDates = !!(checkIn && checkOut);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.listFavorites().then(setItems).catch(() => setItems([]));
  }, [guest]);

  useEffect(() => {
    api.getFilters().then(setFilters).catch(() => undefined);
  }, []);

  // По датам подтягиваем доступность/цены для избранных категорий
  const loadAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) {
      setAvailMap(new Map());
      return;
    }
    setBusy(true);
    try {
      const res: PropertySearchResult[] = await api.search({
        checkIn,
        checkOut,
        guests: primary.adults,
        children: primary.children,
      });
      const map = new Map<string, Avail>();
      for (const p of res) {
        for (const room of p.rooms) {
          map.set(room.roomTypeId, { room, propertyName: p.name, propertyType: p.type });
        }
      }
      setAvailMap(map);
    } catch {
      setAvailMap(new Map());
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, rooms]);

  const first = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => void loadAvailability(), first.current ? 0 : 300);
    first.current = false;
    return () => clearTimeout(t);
  }, [loadAvailability]);

  async function remove(roomTypeId: string) {
    setItems((s) => s?.filter((f) => f.roomTypeId !== roomTypeId) ?? null);
    await api.removeFavorite(roomTypeId).catch(() => undefined);
  }

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

  if (loading || !guest) return <main className="mx-auto max-w-[1100px] px-6 py-16 text-dark-gray">Загрузка…</main>;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <h1 className="mb-5 text-3xl font-light text-ink">Избранное</h1>

      {/* Выбор дат — появятся цены, тарифы и бронирование */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DateRangeCalendar checkIn={checkIn} checkOut={checkOut} onChange={(ci, co) => { setCheckIn(ci); setCheckOut(co); }} guests={primary.adults} children={primary.children} />
        <OccupancyPicker rooms={rooms} onChange={setRooms} />
      </div>

      {!hasDates && (items?.length ?? 0) > 0 && (
        <div className="mt-5 rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-dark-gray">
          Выберите <b className="text-ink">даты заезда и выезда</b> — появятся цены, тарифы и кнопка бронирования с доп-услугами.
        </div>
      )}

      {items === null && <p className="mt-6 text-dark-gray">Загрузка…</p>}
      {items?.length === 0 && (
        <p className="mt-6 text-dark-gray">
          Пока пусто. Добавляйте категории в избранное сердечком на странице{' '}
          <Link href="/search" className="text-ink underline">поиска</Link>.
        </p>
      )}

      {busy && hasDates && <p className="mt-6 text-sm text-dark-gray">Проверяем доступность на выбранные даты…</p>}

      {/* Карточки */}
      {items && items.length > 0 && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => {
            const a = hasDates ? availMap.get(f.roomTypeId) : undefined;
            if (a) {
              return (
                <RoomResultCard
                  key={f.roomTypeId}
                  room={a.room}
                  propertyName={a.propertyName}
                  propertyType={a.propertyType}
                  cashbackPercent={cashback}
                  isGuest
                  ctx={ctx}
                  amenityLabels={amenityLabels}
                  onAdd={addToCart}
                  isFavorite
                  onToggleFavorite={() => void remove(f.roomTypeId)}
                  onOpenDetails={() => ymGoal('view_room', { room: f.roomTypeName, from: 'favorites' })}
                  onSelect={() => ymGoal('select_room', { room: f.roomTypeName, from: 'favorites' })}
                />
              );
            }
            // Нет дат или нет мест — компактная карточка
            return (
              <Card key={f.roomTypeId} className="flex flex-col overflow-hidden p-0">
                <div className="relative aspect-[4/3] w-full bg-beige">
                  {f.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.photos[0]} alt={f.roomTypeName} className="h-full w-full object-cover" />
                  )}
                  <button
                    onClick={() => void remove(f.roomTypeId)}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/55"
                    aria-label="Убрать из избранного"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#e0245e" stroke="#e0245e" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
                  </button>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-[11px] uppercase tracking-wide text-dark-gray">{f.propertyName}</p>
                  <h3 className="mt-0.5 text-base text-ink">{f.roomTypeName}</h3>
                  <p className="mt-1 text-sm text-dark-gray">
                    до {f.capacity} гост.{f.areaSqm ? ` · ${f.areaSqm} м²` : ''}
                  </p>
                  <div className="mt-auto pt-3">
                    <p className="text-sm text-dark-gray">
                      {hasDates ? 'Нет мест на выбранные даты' : 'Выберите даты — появятся цены'}
                    </p>
                    <Link href={`/properties/${f.propertyId}`} className="mt-1 inline-block text-sm text-ink underline">К объекту</Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
