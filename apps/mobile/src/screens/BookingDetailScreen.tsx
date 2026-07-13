import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { Nav } from '../../App';
import { api, BookingView, KeysView } from '../api';
import { Btn, Card, Loading, s } from '../ui';
import { theme } from '../theme';

export function BookingDetailScreen({ nav, bookingId }: { nav: Nav; bookingId: string }) {
  const [b, setB] = useState<BookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getBooking(bookingId).then(setB).catch(() => setError('Бронирование не найдено'));
  }, [bookingId]);

  if (error) return <Text style={[s.muted, { padding: 16, color: theme.red }]}>{error}</Text>;
  if (!b) return <Loading />;

  async function pay() {
    if (!b) return;
    setBusy(true);
    try {
      const p = await api.createPayment(b.id);
      if (p.confirmationUrl) {
        await Linking.openURL(p.confirmationUrl);
        nav.resetTab('bookings');
      } else {
        nav.push({ name: 'payment', paymentId: p.paymentId, amount: p.amount });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!b) return;
    setBusy(true);
    try {
      setB(await api.cancelBooking(b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отмены');
    } finally {
      setBusy(false);
    }
  }

  const repeat = () =>
    nav.push({
      name: 'property',
      propertyId: b.propertyId,
      checkIn: b.checkIn.slice(0, 10),
      checkOut: b.checkOut.slice(0, 10),
      guests: b.guests,
    });

  const dates = `${new Date(b.checkIn).toLocaleDateString('ru')} — ${new Date(
    b.checkOut,
  ).toLocaleDateString('ru')}`;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>{b.propertyName}</Text>
      <Text style={s.muted}>
        {b.roomTypeName} · {b.address}
      </Text>
      <Text style={s.muted}>
        {dates} · {b.nights} ноч. · {b.guests} гост.
      </Text>

      {/* Текущие */}
      {b.section === 'CURRENT' && (
        <Card>
          <Text style={s.h2}>Проживание</Text>
          <Text style={s.muted}>Выезд до {b.checkOutTime ?? '12:00'}</Text>
          {b.stay?.wifiName ? (
            <Text style={s.muted}>
              Wi-Fi: <Text style={{ color: theme.ink }}>{b.stay.wifiName}</Text> / пароль{' '}
              <Text style={{ color: theme.ink }}>{b.stay.wifiPassword}</Text>
            </Text>
          ) : null}
          {b.stay?.instructions ? <Text style={s.muted}>{b.stay.instructions}</Text> : null}
          {b.houseRules ? <Text style={[s.muted, { fontSize: 12 }]}>Правила: {b.houseRules}</Text> : null}
        </Card>
      )}

      {(b.section === 'CURRENT' || b.section === 'UPCOMING') && <KeySection bookingId={b.id} />}

      {/* Предстоящие */}
      {b.section === 'UPCOMING' && (
        <Card>
          <Row label="Статус оплаты" value={b.paymentStatus === 'PAID' ? 'оплачено' : 'не оплачено'} />
          <Row label="Сумма" value={`${b.payableAmount.toLocaleString('ru')} ₽`} />
          {b.cancellationPolicy ? (
            <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
              Условия отмены: {b.cancellationPolicy}
            </Text>
          ) : null}
          <View style={{ gap: 8, marginTop: 12 }}>
            {b.paymentStatus !== 'PAID' && (
              <Btn title={busy ? '…' : 'Оплатить'} onPress={pay} disabled={busy} />
            )}
            <Btn
              title="Онлайн-регистрация"
              variant="secondary"
              onPress={() => nav.push({ name: 'checkin', bookingId: b.id })}
            />
            {b.canCancel && (
              <Btn title="Отменить" variant="secondary" onPress={cancel} disabled={busy} />
            )}
          </View>
        </Card>
      )}

      {/* Прошлые */}
      {b.section === 'PAST' && (
        <Card>
          <Row label="Сумма" value={`${b.payableAmount.toLocaleString('ru')} ₽`} />
          {b.pointsReserved > 0 ? (
            <Text style={s.muted}>Баллы за проживание: {b.pointsReserved}</Text>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <Btn title="Повторить бронирование" onPress={repeat} />
          </View>
        </Card>
      )}

      {/* Отменённые */}
      {b.section === 'CANCELLED' && (
        <Card>
          <Row label="Сумма" value={`${b.totalPrice.toLocaleString('ru')} ₽`} />
          {b.cancelReason ? <Text style={s.muted}>Причина: {b.cancelReason}</Text> : null}
          <Text style={s.muted}>
            Возврат: {b.paymentStatus === 'REFUNDED' ? 'выполнен' : '—'}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Btn title="Повторить бронирование" onPress={repeat} />
          </View>
        </Card>
      )}

      {error && <Text style={{ color: theme.red, marginTop: 10 }}>{error}</Text>}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
      <Text style={s.muted}>{label}</Text>
      <Text style={{ color: theme.ink }}>{value}</Text>
    </View>
  );
}

/** Панель цифровых ключей (§9): коды по дверям номера (личная + общие). */
function KeySection({ bookingId }: { bookingId: string }) {
  const [k, setK] = useState<KeysView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getKey(bookingId).then(setK).catch(() => undefined);
  }, [bookingId]);

  if (!k) return null;
  const anyNotIssued = k.doors.some((d) => d.status === 'NOT_ISSUED');

  async function issue() {
    setBusy(true);
    setMsg(null);
    try {
      setK(await api.issueKey(bookingId));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function openDoor(lockId: string, name: string) {
    setMsg(`Открываю «${name}»…`);
    try {
      await api.openDoor(bookingId, lockId);
      setMsg(`«${name}» — команда на открытие отправлена ✓`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка открытия');
    }
  }

  return (
    <Card>
      <Text style={s.h2}>Цифровой ключ</Text>
      {k.doors.length === 0 ? (
        k.reasons.map((r) => (
          <Text key={r} style={s.muted}>
            • {r}
          </Text>
        ))
      ) : (
        k.doors.map((d) => (
          <View
            key={d.doorName}
            style={{ borderTopWidth: 1, borderTopColor: theme.line, paddingVertical: 10 }}
          >
            <Text style={s.muted}>{d.doorName}</Text>
            {d.pin ? (
              <Text style={{ fontSize: 30, color: theme.ink, letterSpacing: 6 }}>{d.pin}</Text>
            ) : (
              <Text style={{ color: theme.ink }}>
                {d.status === 'ACTIVE' ? 'код появится в окне действия' : 'ещё не выдан'}
              </Text>
            )}
            {d.canRemoteOpen && (
              <View style={{ marginTop: 6 }}>
                <Btn
                  title="Открыть дверь"
                  variant="secondary"
                  onPress={() => openDoor(d.ttlockLockId, d.doorName)}
                />
              </View>
            )}
          </View>
        ))
      )}
      {k.validUntil && k.doors.some((d) => d.pin) ? (
        <Text style={[s.muted, { fontSize: 12, marginTop: 6 }]}>
          Действуют до {new Date(k.validUntil).toLocaleString('ru')}
        </Text>
      ) : null}
      {k.eligible && anyNotIssued && (
        <View style={{ marginTop: 10 }}>
          <Btn title={busy ? 'Создаём…' : 'Получить ключи'} onPress={issue} disabled={busy} />
        </View>
      )}
      {msg && <Text style={{ marginTop: 10, color: theme.ink }}>{msg}</Text>}
    </Card>
  );
}
