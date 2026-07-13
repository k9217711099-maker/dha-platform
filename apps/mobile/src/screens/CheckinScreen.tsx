import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { Nav } from '../../App';
import { api, CheckinStatus, CheckinView } from '../api';
import { Btn, Card, Field, Loading, s } from '../ui';
import { theme } from '../theme';

const STATUS_LABEL: Record<CheckinStatus, string> = {
  NOT_STARTED: 'не начата',
  DRAFT: 'черновик',
  SUBMITTED: 'отправлена',
  UNDER_REVIEW: 'на проверке',
  APPROVED: 'подтверждена',
  REJECTED: 'отклонена',
  NEEDS_FIX: 'требует исправления',
};

export function CheckinScreen({ nav, bookingId }: { nav: Nav; bookingId: string }) {
  const [c, setC] = useState<CheckinView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [arrivalTime, setArrival] = useState('14:00');
  const [departureTime, setDeparture] = useState('12:00');
  const [adults, setAdults] = useState('1');
  const [children, setChildren] = useState<number[]>([]);
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [consents, setConsents] = useState(false);
  const [houseRules, setHouseRules] = useState(false);

  useEffect(() => {
    api
      .getCheckin(bookingId)
      .then((data) => {
        setC(data);
        setArrival(data.arrivalTime ?? '14:00');
        setDeparture(data.departureTime ?? '12:00');
        setAdults(String(data.adults || 1));
        setChildren((data.children ?? []).map((ch) => ch.age));
        setConsents(data.consentsSigned);
        setHouseRules(data.houseRulesAccepted);
      })
      .catch(() => setError('Регистрация недоступна'));
  }, [bookingId]);

  if (error) return <Text style={[s.muted, { padding: 16, color: theme.red }]}>{error}</Text>;
  if (!c) return <Loading />;

  const editable = ['DRAFT', 'NEEDS_FIX', 'REJECTED', 'NOT_STARTED'].includes(c.status);

  async function run(fn: () => Promise<CheckinView | void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res) setC(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() =>
      api.saveCheckin(bookingId, {
        arrivalTime,
        departureTime,
        adults: Number(adults) || 1,
        children: children.map((age) => ({ age })),
        passport: series && number ? { series, number } : undefined,
        consentsSigned: consents,
        houseRulesAccepted: houseRules,
      }),
    );

  const submit = () => run(() => api.submitCheckin(bookingId));

  async function pickPassport() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Нужен доступ к фото для загрузки скана');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    await run(async () => {
      await api.uploadPassport(bookingId, {
        uri: a.uri,
        name: a.fileName ?? 'passport.jpg',
        type: a.mimeType ?? 'image/jpeg',
      });
      return api.getCheckin(bookingId);
    });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Онлайн-регистрация</Text>
      <Text style={s.muted}>
        Статус: <Text style={{ color: theme.ink }}>{STATUS_LABEL[c.status]}</Text>
      </Text>

      {c.status === 'APPROVED' && c.instructions ? (
        <Card>
          <Text style={{ color: theme.ink }}>{c.instructions}</Text>
        </Card>
      ) : null}
      {(c.status === 'REJECTED' || c.status === 'NEEDS_FIX') && c.rejectionReason ? (
        <Card>
          <Text style={{ color: theme.red }}>Замечание: {c.rejectionReason}</Text>
        </Card>
      ) : null}
      {(c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW') && (
        <Card>
          <Text style={s.muted}>Регистрация отправлена и проверяется администратором.</Text>
        </Card>
      )}

      {editable && (
        <>
          <Card>
            <Text style={s.h2}>Время и состав</Text>
            <Field label="Время заезда (ЧЧ:ММ)" value={arrivalTime} onChangeText={setArrival} />
            <Field label="Время выезда (ЧЧ:ММ)" value={departureTime} onChangeText={setDeparture} />
            <Field label="Взрослых" value={adults} onChangeText={setAdults} keyboardType="number-pad" />
            <Text style={s.label}>Дети (возраст)</Text>
            {children.map((age, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={`Ребёнок ${i + 1}`}
                    value={String(age)}
                    onChangeText={(t) =>
                      setChildren(children.map((a, j) => (j === i ? Number(t) || 0 : a)))
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setChildren([...children, 0])}>
                <Text style={{ color: theme.ink }}>+ ребёнок</Text>
              </Pressable>
              {children.length > 0 && (
                <Pressable onPress={() => setChildren(children.slice(0, -1))}>
                  <Text style={s.muted}>убрать</Text>
                </Pressable>
              )}
            </View>
          </Card>

          <Card>
            <Text style={s.h2}>Паспортные данные</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>
              Данные хранятся в зашифрованном виде (152-ФЗ).
            </Text>
            <View style={{ height: 8 }} />
            <Field label="Серия" value={series} onChangeText={setSeries} keyboardType="number-pad" />
            <Field label="Номер" value={number} onChangeText={setNumber} keyboardType="number-pad" />
            <Text style={s.muted}>
              Скан паспорта{c.documentsCount > 0 ? ` (загружено: ${c.documentsCount})` : ''}
            </Text>
            <View style={{ marginTop: 8 }}>
              <Btn title="Загрузить фото паспорта" variant="secondary" onPress={pickPassport} disabled={busy} />
            </View>
          </Card>

          <Card>
            <Pressable
              onPress={() => setConsents(!consents)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
            >
              <Text style={{ fontSize: 18 }}>{consents ? '☑' : '☐'}</Text>
              <Text style={[s.muted, { flex: 1 }]}>
                Подписываю согласия на обработку данных регистрации.
              </Text>
            </Pressable>
            <View style={{ height: 10 }} />
            <Pressable
              onPress={() => setHouseRules(!houseRules)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
            >
              <Text style={{ fontSize: 18 }}>{houseRules ? '☑' : '☐'}</Text>
              <Text style={[s.muted, { flex: 1 }]}>Подтверждаю правила проживания.</Text>
            </Pressable>
          </Card>

          {error && <Text style={{ color: theme.red, marginBottom: 10 }}>{error}</Text>}
          <View style={{ gap: 8 }}>
            <Btn title="Сохранить черновик" variant="secondary" onPress={save} disabled={busy} />
            <Btn title="Отправить на проверку" onPress={submit} disabled={busy} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
