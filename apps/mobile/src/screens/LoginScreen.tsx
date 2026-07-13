import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api, tokenStore } from '../api';
import { Btn, Card, Field, s } from '../ui';
import { theme } from '../theme';

export function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('keytest@dha.ru');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const pair = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      await tokenStore.set(pair);
      onAuthed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 80 }}>
      <Text style={{ color: theme.darkGray, letterSpacing: 3, fontSize: 12 }}>
        D HOTELS & APARTMENTS
      </Text>
      <Text style={[s.h1, { marginTop: 8, marginBottom: 20 }]}>
        {mode === 'login' ? 'Вход' : 'Регистрация'}
      </Text>
      <Card>
        {error && <Text style={{ color: theme.red, marginBottom: 10 }}>{error}</Text>}
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
        <Btn title={busy ? '…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'} onPress={submit} disabled={busy} />
        <View style={{ height: 10 }} />
        <Btn
          title={mode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}
          variant="secondary"
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        />
      </Card>
    </ScrollView>
  );
}
