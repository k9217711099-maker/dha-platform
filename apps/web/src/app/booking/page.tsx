'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { ymGoal } from '../../lib/metrika';
import type { RoomAvailability } from '../../lib/api-types';

function BookingForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { guest, loading } = useAuth();

  const propertyId = params.get('propertyId') ?? '';
  const roomTypeId = params.get('roomTypeId') ?? '';
  const ratePlanId = params.get('ratePlanId') ?? '';
  const checkIn = params.get('checkIn') ?? '';
  const checkOut = params.get('checkOut') ?? '';
  const guests = Number(params.get('guests') ?? '1');
  const children = Number(params.get('children') ?? '0');
  const roomsCount = Math.max(Number(params.get('rooms') ?? '1'), 1);

  const [room, setRoom] = useState<RoomAvailability | null>(null);
  const [comment, setComment] = useState('');
  const [promoCode, setPromoCode] = useState(params.get('promo') ?? '');
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (propertyId && checkIn && checkOut) {
      api
        .getAvailability({ propertyId, checkIn, checkOut, guests, children })
        .then((rooms) => setRoom(rooms.find((r) => r.roomTypeId === roomTypeId) ?? null))
        .catch(() => setError('Не удалось загрузить данные о номере'));
    }
  }, [propertyId, roomTypeId, checkIn, checkOut, guests, children]);

  useEffect(() => {
    if (guest) api.getLoyaltySummary().then((s) => setBalance(s.availableBalance)).catch(() => undefined);
  }, [guest]);

  if (!loading && !guest) {
    return (
      <Card>
        <p className="text-dark-gray">Войдите, чтобы завершить бронирование.</p>
        <Link
          href={`/login`}
          className="mt-3 inline-block text-ink underline"
        >
          Перейти ко входу
        </Link>
      </Card>
    );
  }

  const ratePlan = room?.ratePlans.find((r) => r.id === ratePlanId);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const booking = await api.createBooking({
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        guests,
        roomsCount,
        comment: comment || undefined,
        promoCode: promoCode || undefined,
        pointsToRedeem: points ? Number(points) : undefined,
        channel: 'WEBSITE',
      });
      ymGoal('booking_created', { bookingId: booking.id, amount: booking.payableAmount });
      // Сразу переходим к оплате
      const payment = await api.createPayment(booking.id);
      ymGoal('checkout_payment', { amount: payment.amount });
      if (payment.confirmationUrl) {
        window.location.href = payment.confirmationUrl; // реальный шлюз
      } else {
        router.push(`/payment/${payment.paymentId}?amount=${payment.amount}`); // демо-режим
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать бронирование');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 text-lg text-ink">{room?.propertyName ?? 'Объект'}</h2>
        <p className="text-sm text-dark-gray">
          {room?.roomTypeName} · {checkIn} — {checkOut} · {guests} гост.
          {children > 0 ? ` + ${children} дет.` : ''}
          {roomsCount > 1 ? ` · ${roomsCount} номера` : ''}
        </p>
        {ratePlan && (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <p className="text-sm text-ink">{ratePlan.name}</p>
            <p className="text-xs text-dark-gray">{ratePlan.cancellationPolicy}</p>
            {roomsCount > 1 && (
              <p className="mt-1 text-xs text-dark-gray">
                {ratePlan.totalPrice.toLocaleString('ru')} ₽ × {roomsCount} номера
              </p>
            )}
            <p className="mt-1 text-xl text-ink">{(ratePlan.totalPrice * roomsCount).toLocaleString('ru')} ₽</p>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <Input
          id="promo"
          label="Промокод (необязательно)"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
        />
        <Input
          id="comment"
          label="Комментарий / пожелания"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {balance >= 500 && (
          <Input
            id="points"
            label={`Списать баллов (доступно ${balance.toLocaleString('ru')})`}
            type="number"
            min={0}
            max={balance}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button onClick={() => void confirm()} disabled={busy || !ratePlan} className="w-full">
          {busy ? 'Создаём бронирование…' : 'Перейти к оплате'}
        </Button>
        <p className="text-xs text-dark-gray">
          После подтверждения вы перейдёте к оплате (54-ФЗ, чек формируется автоматически).
        </p>
      </Card>
    </div>
  );
}

export default function BookingPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="mb-4 text-3xl font-light text-ink">Оформление брони</h1>
      <Suspense fallback={<p className="text-dark-gray">Загрузка…</p>}>
        <BookingForm />
      </Suspense>
    </main>
  );
}
