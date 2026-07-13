'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@dha/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import type { BookingView, KeysView } from '../../../lib/api-types';

/** Кнопка-заглушка для функций будущих блоков. */
function SoonButton({ label, hint }: { label: string; hint: string }) {
  return (
    <button
      disabled
      title={hint}
      className="rounded-md border border-ink/15 px-3 py-1.5 text-sm text-dark-gray/60"
    >
      {label}
    </button>
  );
}

/** Панель цифровых ключей (§9): коды по дверям номера (личная + общие). */
function KeySection({ bookingId }: { bookingId: string }) {
  const [k, setK] = useState<KeysView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getKey(bookingId).then(setK).catch(() => undefined);
  }, [bookingId]);

  if (!k) return null;

  async function issue() {
    setBusy(true);
    setErr(null);
    try {
      setK(await api.issueKey(bookingId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function openDoor(lockId: string, name: string) {
    setOpenMsg(`Открываю «${name}»…`);
    try {
      await api.openDoor(bookingId, lockId);
      setOpenMsg(`«${name}» — команда на открытие отправлена ✓`);
    } catch (e) {
      setOpenMsg(e instanceof Error ? e.message : 'Ошибка открытия');
    }
  }

  const anyPin = k.doors.some((d) => d.pin);
  const anyNotIssued = k.doors.some((d) => d.status === 'NOT_ISSUED');

  return (
    <Card>
      <h2 className="mb-2 text-lg text-ink">Цифровой ключ</h2>

      {k.doors.length === 0 ? (
        <ul className="list-inside list-disc text-sm text-dark-gray">
          {k.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          {k.doors.map((d) => (
            <div key={d.doorName} className="flex items-center justify-between gap-3 border-t border-ink/10 pt-2 first:border-0 first:pt-0">
              <div>
                <p className="text-sm text-dark-gray">{d.doorName}</p>
                {d.pin ? (
                  <p className="text-3xl font-light tracking-[0.25em] text-ink">{d.pin}</p>
                ) : (
                  <p className="text-sm text-ink">
                    {d.status === 'ACTIVE' ? 'код появится в окне действия' : 'ещё не выдан'}
                  </p>
                )}
              </div>
              {d.canRemoteOpen && (
                <Button variant="secondary" onClick={() => void openDoor(d.ttlockLockId, d.doorName)}>
                  Открыть дверь
                </Button>
              )}
            </div>
          ))}
          {k.validUntil && anyPin && (
            <p className="text-xs text-dark-gray">
              Действуют до {new Date(k.validUntil).toLocaleString('ru')}
            </p>
          )}
          {openMsg && <p className="text-sm text-ink">{openMsg}</p>}
        </div>
      )}

      {k.eligible && anyNotIssued && (
        <Button onClick={() => void issue()} disabled={busy} className="mt-3">
          {busy ? 'Создаём ключи…' : 'Получить ключи'}
        </Button>
      )}
      {!k.eligible && k.doors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-dark-gray">
          {k.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </Card>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { guest, loading } = useAuth();

  const [b, setB] = useState<BookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.getBooking(id).then(setB).catch(() => setError('Бронирование не найдено'));
  }, [guest, id]);

  if (error) return <main className="mx-auto max-w-2xl px-6 py-16 text-red-700">{error}</main>;
  if (!b) return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;

  async function pay() {
    if (!b) return;
    setBusy(true);
    try {
      const p = await api.createPayment(b.id);
      if (p.confirmationUrl) window.location.href = p.confirmationUrl;
      else router.push(`/payment/${p.paymentId}?amount=${p.amount}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setBusy(false);
    }
  }

  async function cancel() {
    if (!b || !confirm('Отменить бронирование?')) return;
    setBusy(true);
    try {
      setB(await api.cancelBooking(b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отмены');
    } finally {
      setBusy(false);
    }
  }

  const repeat = () => router.push(`/properties/${b.propertyId}`);
  const dates = `${new Date(b.checkIn).toLocaleDateString('ru')} — ${new Date(b.checkOut).toLocaleDateString('ru')}`;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <div>
        <h1 className="text-3xl font-light text-ink">{b.propertyName}</h1>
        <p className="text-sm text-dark-gray">
          {b.roomTypeName} · {b.address}
        </p>
        <p className="mt-1 text-sm text-dark-gray">
          {dates} · {b.nights} ноч. · {b.guests} гост.
          {b.roomsCount > 1 ? ` · ${b.roomsCount} номера` : ''}
        </p>
      </div>

      {b.extras.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg text-ink">Дополнительные услуги</h2>
          <ul className="space-y-1 text-sm">
            {b.extras.map((e, i) => (
              <li key={i} className="flex justify-between text-dark-gray">
                <span>{e.name}{e.qty > 1 ? ` ×${e.qty}` : ''}</span>
                <span className="text-ink">{e.total.toLocaleString('ru')} ₽</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Текущие (§7.1) */}
      {b.section === 'CURRENT' && (
        <Card className="space-y-2">
          <h2 className="text-lg text-ink">Проживание</h2>
          <p className="text-sm text-dark-gray">Выезд до {b.checkOutTime ?? '12:00'}</p>
          {b.stay?.wifiName && (
            <p className="text-sm text-dark-gray">
              Wi-Fi: <span className="text-ink">{b.stay.wifiName}</span> / пароль{' '}
              <span className="text-ink">{b.stay.wifiPassword}</span>
            </p>
          )}
          {b.stay?.instructions && <p className="text-sm text-dark-gray">{b.stay.instructions}</p>}
          {b.houseRules && <p className="text-xs text-dark-gray">Правила: {b.houseRules}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href="/chat">
              <Button variant="secondary">Чат с администратором</Button>
            </Link>
            <SoonButton label="Поздний выезд" hint="Доп. услуги — блок 12" />
          </div>
        </Card>
      )}

      {(b.section === 'CURRENT' || b.section === 'UPCOMING') && <KeySection bookingId={b.id} />}

      {/* Предстоящие (§7.2) */}
      {b.section === 'UPCOMING' && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-dark-gray">Статус оплаты</span>
            <span className="text-ink">{b.paymentStatus === 'PAID' ? 'оплачено' : 'не оплачено'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-dark-gray">Сумма</span>
            <span className="text-ink">{b.payableAmount.toLocaleString('ru')} ₽</span>
          </div>
          <p className="text-xs text-dark-gray">Условия отмены: {b.cancellationPolicy}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {b.paymentStatus !== 'PAID' && (
              <Button onClick={() => void pay()} disabled={busy}>
                Оплатить
              </Button>
            )}
            {b.canCancel && (
              <Button variant="secondary" onClick={() => void cancel()} disabled={busy}>
                Отменить
              </Button>
            )}
            <Link href={`/bookings/${b.id}/checkin`}>
              <Button variant="secondary">Онлайн-регистрация</Button>
            </Link>
            <SoonButton label="Ранний заезд / трансфер" hint="Доп. услуги — блок 12" />
          </div>
        </Card>
      )}

      {/* Прошлые (§7.3) */}
      {b.section === 'PAST' && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-dark-gray">Сумма</span>
            <span className="text-ink">{b.payableAmount.toLocaleString('ru')} ₽</span>
          </div>
          {b.pointsReserved > 0 && (
            <p className="text-sm text-dark-gray">Баллы за проживание: {b.pointsReserved}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={repeat}>Повторить бронирование</Button>
            <SoonButton label="Оставить отзыв" hint="Отзывы — v2" />
            <SoonButton label="Скачать документы" hint="Документы — позже" />
          </div>
        </Card>
      )}

      {/* Отменённые (§7.4) */}
      {b.section === 'CANCELLED' && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-dark-gray">Сумма</span>
            <span className="text-ink">{b.totalPrice.toLocaleString('ru')} ₽</span>
          </div>
          {b.cancelReason && <p className="text-sm text-dark-gray">Причина: {b.cancelReason}</p>}
          <p className="text-sm text-dark-gray">
            Статус возврата: {b.paymentStatus === 'REFUNDED' ? 'возврат выполнен' : '—'}
          </p>
          <div className="pt-1">
            <Button onClick={repeat}>Повторить бронирование</Button>
          </div>
        </Card>
      )}
    </main>
  );
}
