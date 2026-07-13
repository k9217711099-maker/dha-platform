import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import type { Nav, Route } from '../../App';
import { api } from '../api';
import { Btn, Card, s } from '../ui';
import { theme } from '../theme';

type R = Extract<Route, { name: 'payment' }>;

export function PaymentScreen({ nav, route }: { nav: Nav; route: R }) {
  const { paymentId, amount } = route;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await api.simulatePayment(paymentId);
      nav.resetTab('bookings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка оплаты');
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Оплата</Text>
      <Card>
        <Text style={s.muted}>Демо-режим оплаты (mock-провайдер).</Text>
        <Text style={{ fontSize: 28, color: theme.ink, marginTop: 6 }}>
          {amount.toLocaleString('ru')} ₽
        </Text>
        <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
          В проде здесь будет переход на страницу YooKassa. Чек 54-ФЗ формируется автоматически.
        </Text>
        {error && <Text style={{ color: theme.red, marginTop: 10 }}>{error}</Text>}
        <Btn title={busy ? 'Оплачиваем…' : 'Оплатить (демо)'} onPress={pay} disabled={busy} />
      </Card>
    </ScrollView>
  );
}
