import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Nav, Route } from '../../App';
import { api, PropertyDetail, RoomAvailability, RatePlan } from '../api';
import { Btn, Card, Loading, s } from '../ui';
import { theme } from '../theme';

type R = Extract<Route, { name: 'property' }>;

export function PropertyScreen({ nav, route }: { nav: Nav; route: R }) {
  const { propertyId, checkIn, checkOut, guests } = route;
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [rooms, setRooms] = useState<RoomAvailability[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getProperty(propertyId).then(setProperty).catch(() => setError('Объект не найден'));
    api
      .getAvailability({ propertyId, checkIn, checkOut, guests })
      .then(setRooms)
      .catch(() => setRooms([]));
  }, [propertyId, checkIn, checkOut, guests]);

  function book(room: RoomAvailability, ratePlan: RatePlan) {
    nav.push({ name: 'booking', room, ratePlan, checkIn, checkOut, guests });
  }

  if (error) return <Text style={[s.muted, { padding: 16, color: theme.red }]}>{error}</Text>;
  if (!property) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>{property.name}</Text>
      <Text style={s.muted}>
        {property.city}, {property.address}
      </Text>
      {property.description ? (
        <Text style={[s.muted, { marginTop: 8 }]}>{property.description}</Text>
      ) : null}

      {property.amenities.length > 0 && (
        <Card>
          <Text style={s.h2}>Удобства</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {property.amenities.map((a) => (
              <Text key={a} style={pill}>
                {a}
              </Text>
            ))}
          </View>
        </Card>
      )}

      <Text style={[s.h2, { marginTop: 8 }]}>
        {new Date(checkIn).toLocaleDateString('ru')} — {new Date(checkOut).toLocaleDateString('ru')} ·{' '}
        {guests} гост.
      </Text>

      {!rooms ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <Text style={s.muted}>На выбранные даты нет доступных категорий.</Text>
      ) : (
        rooms.map((room) => (
          <Card key={room.roomTypeId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.ink, fontSize: 16 }}>{room.roomTypeName}</Text>
              <Text style={s.muted}>осталось: {room.available}</Text>
            </View>
            <Text style={s.muted}>
              До {room.capacity} гостей · {room.nights} ноч.
            </Text>
            {room.ratePlans.map((rp) => (
              <View key={rp.id} style={rateRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.ink }}>{rp.name}</Text>
                  <Text style={[s.muted, { fontSize: 12 }]}>{rp.cancellationPolicy}</Text>
                  <Text style={{ color: theme.ink, marginTop: 2 }}>
                    {rp.totalPrice.toLocaleString('ru')} ₽
                    <Text style={s.muted}> · {rp.perNight.toLocaleString('ru')} ₽/ночь</Text>
                  </Text>
                </View>
                <Btn title="Забронировать" onPress={() => book(room, rp)} />
              </View>
            ))}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const pill = {
  backgroundColor: theme.beige,
  color: theme.ink,
  fontSize: 12,
  borderRadius: 6,
  paddingHorizontal: 8,
  paddingVertical: 4,
} as const;

const rateRow = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderTopWidth: 1,
  borderTopColor: theme.line,
  paddingTop: 10,
  marginTop: 10,
} as const;
