import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api, LoyaltySummary } from '../api';
import { Card, Loading, s } from '../ui';
import { theme } from '../theme';

export function LoyaltyScreen() {
  const [data, setData] = useState<LoyaltySummary | null>(null);

  useEffect(() => {
    api.loyalty().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Баллы</Text>
      <Card>
        <Text style={s.muted}>Доступно баллов</Text>
        <Text style={{ fontSize: 36, fontWeight: '300', color: theme.ink }}>
          {data.availableBalance.toLocaleString('ru')}
        </Text>
        {data.pendingBalance > 0 && (
          <Text style={s.muted}>+ {data.pendingBalance.toLocaleString('ru')} ожидают начисления</Text>
        )}
      </Card>
      <Card>
        <Text style={s.muted}>Уровень</Text>
        <Text style={{ fontSize: 24, color: theme.ink }}>{data.tier}</Text>
        {data.progress.next ? (
          <Text style={[s.muted, { marginTop: 6 }]}>
            До {data.progress.next}: ещё {data.progress.amountToNext.toLocaleString('ru')} ₽ или{' '}
            {data.progress.nightsToNext} ноч.
          </Text>
        ) : (
          <Text style={[s.muted, { marginTop: 6 }]}>Максимальный уровень.</Text>
        )}
      </Card>
    </ScrollView>
  );
}
