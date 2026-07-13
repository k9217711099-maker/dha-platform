'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { ymGoal } from '../../lib/metrika';

export default function CheckoutPage() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const cart = useCart();

  const [comment, setComment] = useState('');
  const [promo, setPromo] = useState('');
  const [points, setPoints] = useState('');
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.getLoyaltySummary().then((s) => setBalance(s.availableBalance)).catch(() => undefined);
  }, [guest]);

  if (loading || !guest) return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;

  // Баллы — только для одного номера (одна позиция, один номер)
  const singleRoom = cart.items.length === 1 && cart.items[0]!.roomsCount === 1;

  async function pay() {
    if (cart.items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const group = await api.createBookingGroup({
        items: cart.items.map((i) => ({
          roomTypeId: i.roomTypeId,
          ratePlanId: i.ratePlanId,
          checkIn: i.checkIn,
          checkOut: i.checkOut,
          guests: i.guests,
          roomsCount: i.roomsCount,
          extras: i.extras.map((e) => ({ extraId: e.extraId, qty: e.qty })),
        })),
        promoCode: promo.trim() || undefined,
        comment: comment.trim() || undefined,
        pointsToRedeem: singleRoom && points ? Number(points) : undefined,
        channel: 'WEBSITE',
      });
      ymGoal('booking_created', { groupId: group.groupId, amount: group.totalPayable, rooms: cart.count });
      const payment = await api.createGroupPayment(group.groupId);
      ymGoal('checkout_payment', { amount: payment.amount });
      cart.clear();
      if (payment.confirmationUrl) window.location.href = payment.confirmationUrl;
      else router.push(`/payment/${payment.paymentId}?amount=${payment.amount}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось оформить бронирование');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <h1 className="text-3xl font-light text-ink">Оформление</h1>

      {cart.items.length === 0 ? (
        <Card>
          <p className="text-dark-gray">
            Подбор пуст. Выберите номера на странице{' '}
            <Link href="/search" className="text-ink underline">поиска</Link>.
          </p>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <h2 className="text-lg text-ink">Выбранные номера</h2>
            {cart.items.map((i) => {
              const key = cart.keyOf(i);
              return (
                <div key={key} className="flex items-center gap-3 border-t border-ink/10 pt-3 first:border-0 first:pt-0">
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-beige">
                    {i.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.photo} alt={i.roomTypeName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-ink">{i.propertyName} · {i.roomTypeName}</p>
                    <p className="text-xs text-dark-gray">
                      {i.checkIn} — {i.checkOut} · {i.guests} гост.{i.children ? ` + ${i.children} дет.` : ''}
                    </p>
                    <p className="text-xs text-dark-gray">{i.ratePlanName}</p>
                    {i.extras.length > 0 && (
                      <p className="text-xs text-dark-gray">
                        Услуги: {i.extras.map((e) => `${e.name}${e.qty > 1 ? `×${e.qty}` : ''}`).join(', ')} · +{i.extrasTotal.toLocaleString('ru')} ₽
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cart.setRooms(key, i.roomsCount - 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/25 hover:bg-beige">−</button>
                    <span className="w-5 text-center text-sm">{i.roomsCount}</span>
                    <button onClick={() => cart.setRooms(key, i.roomsCount + 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/25 hover:bg-beige">+</button>
                  </div>
                  <div className="w-24 text-right">
                    <p className="text-ink">{((i.totalPrice + i.extrasTotal) * i.roomsCount).toLocaleString('ru')} ₽</p>
                    <button onClick={() => cart.remove(key)} className="text-xs text-dark-gray underline hover:text-red-700">убрать</button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-ink/10 pt-3">
              <span className="text-dark-gray">Итого ({cart.count} номеров)</span>
              <span className="text-xl text-ink">{cart.total.toLocaleString('ru')} ₽</span>
            </div>
          </Card>

          <Card className="space-y-3">
            <Input id="promo" label="Промокод (необязательно)" value={promo} onChange={(e) => setPromo(e.target.value)} />
            <Input id="comment" label="Комментарий / пожелания" value={comment} onChange={(e) => setComment(e.target.value)} />
            {singleRoom && balance >= 500 && (
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
            {!singleRoom && (
              <p className="text-xs text-dark-gray">Списание баллов доступно при бронировании одного номера.</p>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button onClick={() => void pay()} disabled={busy} className="w-full">
              {busy ? 'Оформляем…' : `Перейти к оплате · ${cart.total.toLocaleString('ru')} ₽`}
            </Button>
            <p className="text-xs text-dark-gray">Один платёж за все номера. Чек 54-ФЗ формируется автоматически.</p>
          </Card>
        </>
      )}
    </main>
  );
}
