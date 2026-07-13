'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import type { BookingSection, BookingView } from '../../lib/api-types';

const SECTION_TITLES: Record<BookingSection, string> = {
  CURRENT: 'Текущие',
  UPCOMING: 'Предстоящие',
  PAST: 'Прошлые',
  CANCELLED: 'Отменённые',
};
const SECTION_ORDER: BookingSection[] = ['CURRENT', 'UPCOMING', 'PAST', 'CANCELLED'];

function BookingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { guest, loading } = useAuth();
  const createdId = params.get('created');
  const paid = params.get('paid');

  const [bookings, setBookings] = useState<BookingView[] | null>(null);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.listBookings().then(setBookings).catch(() => setBookings([]));
  }, [guest]);

  if (loading || !guest) {
    return <p className="text-dark-gray">Загрузка…</p>;
  }

  const grouped = (section: BookingSection) =>
    (bookings ?? []).filter((b) => b.section === section);

  return (
    <>
      {paid && (
        <p className="mb-4 rounded-md bg-beige px-4 py-2 text-sm text-ink">
          Оплата прошла, бронирование подтверждено. Чек отправлен на email.
        </p>
      )}
      {createdId && !paid && (
        <p className="mb-4 rounded-md bg-beige px-4 py-2 text-sm text-ink">
          Бронирование создано.
        </p>
      )}
      {bookings === null && <p className="text-dark-gray">Загрузка…</p>}
      {bookings?.length === 0 && <p className="text-dark-gray">У вас пока нет бронирований.</p>}

      {SECTION_ORDER.map((section) => {
        const items = grouped(section);
        if (items.length === 0) return null;
        return (
          <section key={section} className="mb-8">
            <h2 className="mb-3 text-xl font-light text-ink">{SECTION_TITLES[section]}</h2>
            <div className="space-y-3">
              {items.map((b) => (
                <Link key={b.id} href={`/bookings/${b.id}`} className="block">
                  <Card className="flex items-start justify-between gap-4 transition hover:border-ink/30">
                    <div>
                      <h3 className="text-ink">{b.propertyName}</h3>
                      <p className="text-sm text-dark-gray">
                        {b.roomTypeName} · {b.address}
                      </p>
                      <p className="mt-1 text-sm text-dark-gray">
                        {new Date(b.checkIn).toLocaleDateString('ru')} —{' '}
                        {new Date(b.checkOut).toLocaleDateString('ru')} · {b.nights} ноч.
                      </p>
                      <p className="mt-1 text-xs text-dark-gray">
                        Тариф: {b.ratePlanName} · {b.cancellationPolicy}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg text-ink">{b.payableAmount.toLocaleString('ru')} ₽</p>
                      <p className="text-xs text-dark-gray">
                        {b.paymentStatus === 'PAID' ? 'оплачено' : 'не оплачено'}
                      </p>
                      {b.pointsReserved > 0 && (
                        <p className="mt-1 text-xs text-dark-gray">+{b.pointsReserved} баллов</p>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

export default function BookingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-light text-ink">Мои бронирования</h1>
      <Suspense fallback={<p className="text-dark-gray">Загрузка…</p>}>
        <BookingsInner />
      </Suspense>
    </main>
  );
}
