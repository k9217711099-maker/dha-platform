import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Nav } from '../../App';
import { api, SearchResult } from '../api';
import { Btn, Card, Field, s } from '../ui';
import { theme } from '../theme';

function plusDays(d: number) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}

export function SearchScreen({ nav }: { nav: Nav }) {
  const [checkIn, setCheckIn] = useState(plusDays(7));
  const [checkOut, setCheckOut] = useState(plusDays(9));
  const [guests, setGuests] = useState('2');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResults(await api.search({ checkIn, checkOut, guests: Number(guests) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function open(r: SearchResult) {
    nav.push({ name: 'property', propertyId: r.propertyId, checkIn, checkOut, guests: Number(guests) });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Поиск</Text>
      <Card>
        <Field label="Заезд (ГГГГ-ММ-ДД)" value={checkIn} onChangeText={setCheckIn} />
        <Field label="Выезд (ГГГГ-ММ-ДД)" value={checkOut} onChangeText={setCheckOut} />
        <Field label="Гостей" value={guests} onChangeText={setGuests} keyboardType="number-pad" />
        <Btn title={busy ? 'Ищем…' : 'Найти'} onPress={run} disabled={busy} />
      </Card>

      {error && <Text style={{ color: theme.red }}>{error}</Text>}
      {results?.length === 0 && <Text style={s.muted}>Ничего не найдено.</Text>}
      {results?.map((r) => (
        <Pressable key={r.propertyId} onPress={() => open(r)}>
          <Card>
            <Text style={s.h2}>{r.name}</Text>
            <Text style={s.muted}>{r.address}</Text>
            <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.muted}>{r.amenities.slice(0, 3).join(' · ')}</Text>
              <Text style={{ color: theme.ink, fontSize: 16 }}>
                от {r.fromPrice.toLocaleString('ru')} ₽
              </Text>
            </View>
            <Text style={{ marginTop: 8, color: theme.ink }}>Выбрать номер ›</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
