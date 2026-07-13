import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { api, GuestProfile } from '../api';
import { Btn, Card, Field, Loading, s } from '../ui';
import { theme } from '../theme';

export function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
    birthDate: '',
    citizenship: '',
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgMsg, setTgMsg] = useState<string | null>(null);

  function fill(g: GuestProfile) {
    setGuest(g);
    setForm({
      firstName: g.firstName ?? '',
      lastName: g.lastName ?? '',
      middleName: g.middleName ?? '',
      birthDate: g.birthDate ? g.birthDate.slice(0, 10) : '',
      citizenship: g.citizenship ?? '',
    });
  }

  useEffect(() => {
    api.getMe().then(fill).catch(() => undefined);
  }, []);

  if (!guest) return <Loading />;

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const g = await api.updateProfile({
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        middleName: form.middleName || undefined,
        birthDate: form.birthDate || undefined,
        citizenship: form.citizenship || undefined,
      });
      fill(g);
      setStatus('Профиль сохранён');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMarketing() {
    if (!guest) return;
    const g = await api.updateMarketingConsent(!guest.consents.MARKETING);
    fill(g);
  }

  async function connectTelegram() {
    setTgBusy(true);
    setTgMsg(null);
    try {
      const res = await api.aiTelegramLinkToken();
      if (res.deepLink) {
        await Linking.openURL(res.deepLink);
        setTgMsg('Открываем Telegram… нажмите «Start» в чате бота.');
      } else {
        setTgMsg(`Отправьте боту команду: /start ${res.token}`);
      }
    } catch (e) {
      setTgMsg(e instanceof Error ? e.message : 'Не удалось создать ссылку');
    } finally {
      setTgBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>Профиль</Text>
      <Text style={s.muted}>
        {guest.email ?? guest.phone} · уровень:{' '}
        <Text style={{ color: theme.ink }}>{guest.loyaltyTier}</Text>
      </Text>

      <Card>
        <Text style={s.h2}>Личные данные</Text>
        {status && <Text style={[s.muted, { marginBottom: 6 }]}>{status}</Text>}
        <Field label="Фамилия" value={form.lastName} onChangeText={(t) => setForm({ ...form, lastName: t })} autoCapitalize="words" />
        <Field label="Имя" value={form.firstName} onChangeText={(t) => setForm({ ...form, firstName: t })} autoCapitalize="words" />
        <Field label="Отчество" value={form.middleName} onChangeText={(t) => setForm({ ...form, middleName: t })} autoCapitalize="words" />
        <Field label="Дата рождения (ГГГГ-ММ-ДД)" value={form.birthDate} onChangeText={(t) => setForm({ ...form, birthDate: t })} />
        <Field label="Гражданство (код, напр. RU)" value={form.citizenship} onChangeText={(t) => setForm({ ...form, citizenship: t })} />
        <Btn title={busy ? 'Сохраняем…' : 'Сохранить'} onPress={save} disabled={busy} />
      </Card>

      <Card>
        <Text style={s.h2}>Согласия (152-ФЗ)</Text>
        <Text style={s.muted}>
          Обработка персональных данных:{' '}
          <Text style={{ color: theme.ink }}>{guest.consents.PERSONAL_DATA ? 'дано' : 'не дано'}</Text>
        </Text>
        <Pressable
          onPress={toggleMarketing}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}
        >
          <Text style={{ fontSize: 18 }}>{guest.consents.MARKETING ? '☑' : '☐'}</Text>
          <Text style={s.muted}>Получать маркетинговые сообщения</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={s.h2}>Telegram-бот</Text>
        <Text style={s.muted}>
          Подключите Telegram, чтобы AI-администратор подбирал номера, оформлял брони и оплату
          прямо в чате бота — от вашего имени.
        </Text>
        <View style={{ marginTop: 10 }}>
          <Btn
            title={tgBusy ? 'Готовим ссылку…' : 'Подключить Telegram'}
            onPress={connectTelegram}
            disabled={tgBusy}
          />
        </View>
        {tgMsg && <Text style={[s.muted, { marginTop: 8 }]}>{tgMsg}</Text>}
      </Card>

      <View style={{ marginTop: 8 }}>
        <Btn title="Выйти" variant="secondary" onPress={onLogout} />
      </View>
    </ScrollView>
  );
}
