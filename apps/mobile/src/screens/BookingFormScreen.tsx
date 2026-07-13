import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { Nav, Route } from '../../App';
import { api } from '../api';
import { Btn, Card, Field, s } from '../ui';
import { theme } from '../theme';

type R = Extract<Route, { name: 'booking' }>;

export function BookingFormScreen({ nav, route }: { nav: Nav; route: R }) {
  const { room, ratePlan, checkIn, checkOut, guests } = route;
  const [comment, setComment] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .loyalty()
      .then((l) => setBalance(l.availableBalance))
      .catch(() => undefined);
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const booking = await api.createBooking({
        roomTypeId: room.roomTypeId,
        ratePlanId: ratePlan.id,
        checkIn,
        checkOut,
        guests,
        comment: comment || undefined,
        promoCode: promoCode || undefined,
        pointsToRedeem: points ? Number(points) : undefined,
        channel: 'MOBILE_APP',
      });
      const payment = await api.createPayment(booking.id);
      if (payment.confirmationUrl) {
        // Реальный шлюз (YooKassa) — открываем страницу оплаты в браузере
        await Linking.openURL(payment.confirmationUrl);
        nav.resetTab('bookings');
      } else {
        nav.replace({ name: 'payment', paymentId: payment.paymentId, amount: payment.amount });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать бронирование');
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Оформление брони</Text>

      <Card>
        <Text style={s.h2}>{room.propertyName}</Text>
        <Text style={s.muted}>
          {room.roomTypeName} · {new Date(checkIn).toLocaleDateString('ru')} —{' '}
          {new Date(checkOut).toLocaleDateString('ru')} · {guests} гост.
        </Text>
        <View style={{ borderTopWidth: 1, borderTopColor: theme.line, marginTop: 10, paddingTop: 10 }}>
          <Text style={{ color: theme.ink }}>{ratePlan.name}</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>{ratePlan.cancellationPolicy}</Text>
          <Text style={{ fontSize: 22, color: theme.ink, marginTop: 4 }}>
            {ratePlan.totalPrice.toLocaleString('ru')} ₽
          </Text>
        </View>
      </Card>

      <Card>
        <Field label="Промокод (необязательно)" value={promoCode} onChangeText={setPromoCode} />
        <Field label="Комментарий / пожелания" value={comment} onChangeText={setComment} />
        {balance >= 500 && (
          <Field
            label={`Списать баллов (доступно ${balance.toLocaleString('ru')})`}
            value={points}
            onChangeText={setPoints}
            keyboardType="number-pad"
          />
        )}
        {error && <Text style={{ color: theme.red, marginBottom: 10 }}>{error}</Text>}
        <Btn title={busy ? 'Создаём бронирование…' : 'Перейти к оплате'} onPress={confirm} disabled={busy} />
        <Text style={[s.muted, { fontSize: 12, marginTop: 8 }]}>
          После подтверждения вы перейдёте к оплате (54-ФЗ, чек формируется автоматически).
        </Text>
      </Card>
    </ScrollView>
  );
}
