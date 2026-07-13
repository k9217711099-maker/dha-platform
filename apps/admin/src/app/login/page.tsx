'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, adminToken } from '../../lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await adminApi.login(email, password);
      adminToken.set(accessToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="mb-6 text-2xl font-light text-ink">Вход в админ-панель</h1>
      <Card>
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
        <form className="space-y-4" onSubmit={submit}>
          <Input id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input id="password" label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Входим…' : 'Войти'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
