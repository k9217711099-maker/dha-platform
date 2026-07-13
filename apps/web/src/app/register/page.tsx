'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptPersonalData, setAcceptPd] = useState(false);
  const [acceptMarketing, setAcceptMk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const pair = await api.register({ email, password, acceptPersonalData, acceptMarketing });
      void api.track('registration');
      await setSession(pair);
      router.push('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-6 text-3xl font-light text-ink">Регистрация</h1>
      <Card>
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
        <form className="space-y-4" onSubmit={submit}>
          <Input
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            label="Пароль (не менее 8 символов)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <label className="flex items-start gap-2 text-xs text-dark-gray">
            <input
              type="checkbox"
              checked={acceptPersonalData}
              onChange={(e) => setAcceptPd(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>Согласен на обработку персональных данных (обязательно).</span>
          </label>
          <label className="flex items-start gap-2 text-xs text-dark-gray">
            <input
              type="checkbox"
              checked={acceptMarketing}
              onChange={(e) => setAcceptMk(e.target.checked)}
              className="mt-0.5"
            />
            <span>Согласен получать маркетинговые сообщения (необязательно).</span>
          </label>
          <Button type="submit" disabled={busy || !acceptPersonalData} className="w-full">
            {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-dark-gray">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-ink underline">
          Войти
        </Link>
      </p>
    </main>
  );
}
