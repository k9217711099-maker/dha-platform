'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import {
  AMENITIES,
  DISTRICT_LABELS,
  PROPERTY_FEATURES,
  PROPERTY_TYPE_LABELS,
  type District,
  type PropertyType,
} from '@dha/domain';
import { api } from '../../../lib/api';
import { DateRangeCalendar } from '../../../components/DateRangeCalendar';
import type { PropertyDetail, RoomAvailability } from '../../../lib/api-types';

const amenityLabel = new Map(AMENITIES.map((a) => [a.code, a.label]));
const featureLabel = new Map(PROPERTY_FEATURES.map((f) => [f.code, f.label]));

function PropertyInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();

  const checkIn = params.get('checkIn') ?? '';
  const checkOut = params.get('checkOut') ?? '';
  const guests = params.get('guests') ?? '';

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [rooms, setRooms] = useState<RoomAvailability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fIn, setFIn] = useState(checkIn);
  const [fOut, setFOut] = useState(checkOut);
  const [fGuests, setFGuests] = useState(guests || '2');

  const applyDates = () =>
    router.replace(`/properties/${id}?checkIn=${fIn}&checkOut=${fOut}&guests=${fGuests}`);

  useEffect(() => {
    api.getProperty(id).then(setProperty).catch(() => setError('Объект не найден'));
    if (checkIn && checkOut) {
      api
        .getAvailability({ propertyId: id, checkIn, checkOut, guests: guests ? Number(guests) : undefined })
        .then(setRooms)
        .catch(() => undefined);
    }
  }, [id, checkIn, checkOut, guests]);

  if (error) return <main className="mx-auto max-w-3xl px-6 py-16 text-red-700">{error}</main>;
  if (!property) return <main className="mx-auto max-w-3xl px-6 py-16 text-dark-gray">Загрузка…</main>;

  function book(roomTypeId: string, ratePlanId: string) {
    const q = new URLSearchParams({ propertyId: id, roomTypeId, ratePlanId, checkIn, checkOut, guests });
    router.push(`/booking?${q.toString()}`);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-widest text-dark-gray">
          {PROPERTY_TYPE_LABELS[property.type as PropertyType] ?? property.type}
          {property.district ? ` · ${DISTRICT_LABELS[property.district as District]}` : ''}
        </p>
        <h1 className="mt-1 text-3xl font-light text-ink">{property.name}</h1>
        <p className="text-sm text-dark-gray">
          {property.city}, {property.address}
        </p>
      </div>

      {property.description && <p className="text-dark-gray">{property.description}</p>}

      <Card>
        <h2 className="mb-3 text-lg text-ink">Удобства</h2>
        <div className="flex flex-wrap gap-2">
          {property.amenities.map((a) => (
            <span key={a} className="rounded-md bg-beige px-2.5 py-1 text-xs text-ink">
              {amenityLabel.get(a) ?? a}
            </span>
          ))}
        </div>
        {property.features.length > 0 && (
          <>
            <h2 className="mb-3 mt-5 text-lg text-ink">Особенности</h2>
            <div className="flex flex-wrap gap-2">
              {property.features.map((f) => (
                <span key={f} className="rounded-md border border-ink/15 px-2.5 py-1 text-xs text-dark-gray">
                  {featureLabel.get(f) ?? f}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg text-ink">Выбор дат</h2>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_120px_140px]">
          <DateRangeCalendar
            checkIn={fIn || checkIn}
            checkOut={fOut || checkOut}
            onChange={(ci, co) => {
              setFIn(ci);
              setFOut(co);
            }}
            propertyId={id}
            guests={Number(fGuests) || 2}
          />
          <Input
            id="fguests"
            label="Гостей"
            type="number"
            min={1}
            value={fGuests}
            onChange={(e) => setFGuests(e.target.value)}
          />
          <Button onClick={applyDates} disabled={!fIn || !fOut} className="w-full">
            Показать цены
          </Button>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-xl font-light text-ink">
          {checkIn && checkOut ? 'Доступность и тарифы' : 'Категории'}
        </h2>

        {!checkIn || !checkOut ? (
          <div className="space-y-3">
            {property.roomTypes.map((rt) => (
              <Card key={rt.id}>
                <h3 className="text-ink">{rt.name}</h3>
                <p className="text-sm text-dark-gray">
                  До {rt.capacity} гостей{rt.areaSqm ? ` · ${rt.areaSqm} м²` : ''}
                  {rt.bedType ? ` · ${rt.bedType}` : ''}
                </p>
              </Card>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-dark-gray">На выбранные даты нет доступных категорий.</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <Card key={room.roomTypeId}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-ink">{room.roomTypeName}</h3>
                    <p className="text-sm text-dark-gray">
                      До {room.capacity} гостей · {room.nights} ноч.
                    </p>
                  </div>
                  <span className="text-xs text-dark-gray">осталось: {room.available}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {room.ratePlans.map((rp) => (
                    <div
                      key={rp.id}
                      className="flex items-center justify-between border-t border-ink/10 pt-2"
                    >
                      <div>
                        <p className="text-sm text-ink">{rp.name}</p>
                        <p className="text-xs text-dark-gray">{rp.cancellationPolicy}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-ink">{rp.totalPrice.toLocaleString('ru')} ₽</p>
                        <p className="text-xs text-dark-gray">
                          {rp.perNight.toLocaleString('ru')} ₽ / ночь
                        </p>
                        <Button className="mt-1" onClick={() => book(room.roomTypeId, rp.id)}>
                          Забронировать
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function PropertyPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-16 text-dark-gray">Загрузка…</main>}>
      <PropertyInner />
    </Suspense>
  );
}
