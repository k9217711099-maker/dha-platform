import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Nav } from '../../App';
import { api, BookingView } from '../api';
import { Card, Loading, s } from '../ui';
import { theme } from '../theme';

const TITLES: Record<BookingView['section'], string> = {
  CURRENT: 'Текущие',
  UPCOMING: 'Предстоящие',
  PAST: 'Прошлые',
  CANCELLED: 'Отменённые',
};
const ORDER: BookingView['section'][] = ['CURRENT', 'UPCOMING', 'PAST', 'CANCELLED'];

export function BookingsScreen({ nav }: { nav: Nav }) {
  const [items, setItems] = useState<BookingView[] | null>(null);

  useEffect(() => {
    api.bookings().then(setItems).catch(() => setItems([]));
  }, []);

  if (!items) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Мои брони</Text>
      {items.length === 0 && <Text style={s.muted}>Бронирований пока нет.</Text>}
      {ORDER.map((sec) => {
        const list = items.filter((b) => b.section === sec);
        if (!list.length) return null;
        return (
          <View key={sec} style={{ marginBottom: 16 }}>
            <Text style={[s.h2, { marginTop: 8 }]}>{TITLES[sec]}</Text>
            {list.map((b) => (
              <Pressable key={b.id} onPress={() => nav.push({ name: 'bookingDetail', id: b.id })}>
                <Card>
                  <Text style={{ color: theme.ink, fontSize: 16 }}>{b.propertyName}</Text>
                  <Text style={s.muted}>{b.roomTypeName} · {b.address}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={s.muted}>
                      {new Date(b.checkIn).toLocaleDateString('ru')} — {new Date(b.checkOut).toLocaleDateString('ru')}
                    </Text>
                    <Text style={{ color: theme.ink }}>{b.payableAmount.toLocaleString('ru')} ₽</Text>
                  </View>
                  <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
                    {b.paymentStatus === 'PAID' ? 'оплачено' : 'не оплачено'}
                    {b.pointsReserved > 0 ? ` · +${b.pointsReserved} баллов` : ''}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
