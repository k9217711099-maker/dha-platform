'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import type { TokenPair } from '../../lib/api-types';

type Method = 'phone' | 'password' | 'email-code';

const methods: { key: Method; label: string }[] = [
  { key: 'phone', label: 'Телефон' },
  { key: 'password', label: 'Email + пароль' },
  { key: 'email-code', label: 'Email-код' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();

  const [method, setMethod] = useState<Method>('phone');
  const [codeSent, setCodeSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [acceptPersonalData, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setCodeSent(false);
    setCode('');
    setError(null);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function onSuccess(pair: TokenPair) {
    await setSession(pair);
    router.push('/profile');
  }

  const requestCode = () =>
    run(async () => {
      if (method === 'phone') await api.requestPhoneOtp(phone);
      else await api.requestEmailOtp(email);
      setCodeSent(true);
    });

  const verifyCode = () =>
    run(async () => {
      const pair =
        method === 'phone'
          ? await api.verifyPhoneOtp({ phone, code, acceptPersonalData })
          : await api.verifyEmailOtp({ email, code, acceptPersonalData });
      await onSuccess(pair);
    });

  const loginPassword = () =>
    run(async () => {
      await onSuccess(await api.login({ email, password }));
    });

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-6 text-3xl font-light text-ink">Вход</h1>

      <div className="mb-6 flex gap-2">
        {methods.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              setMethod(m.key);
              reset();
            }}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              method === m.key ? 'bg-ink text-white' : 'border border-ink/20 text-dark-gray'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card>
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

        {method === 'password' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void loginPassword();
            }}
          >
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
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Входим…' : 'Войти'}
            </Button>
          </form>
        )}

        {(method === 'phone' || method === 'email-code') && (
          <div className="space-y-4">
            {method === 'phone' ? (
              <Input
                id="phone"
                label="Телефон"
                placeholder="+79210000000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={codeSent}
              />
            ) : (
              <Input
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={codeSent}
              />
            )}

            {!codeSent ? (
              <Button onClick={() => void requestCode()} disabled={busy} className="w-full">
                {busy ? 'Отправляем…' : 'Получить код'}
              </Button>
            ) : (
              <>
                <Input
                  id="code"
                  label="Код из сообщения"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                />
                <label className="flex items-start gap-2 text-xs text-dark-gray">
                  <input
                    type="checkbox"
                    checked={acceptPersonalData}
                    onChange={(e) => setAccept(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Согласен на обработку персональных данных (требуется при первом входе).
                  </span>
                </label>
                <Button
                  onClick={() => void verifyCode()}
                  disabled={busy || !acceptPersonalData}
                  className="w-full"
                >
                  {busy ? 'Проверяем…' : 'Подтвердить'}
                </Button>
                <button
                  onClick={reset}
                  className="w-full text-center text-xs text-dark-gray underline"
                >
                  Изменить контакт
                </button>
              </>
            )}
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-sm text-dark-gray">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-ink underline">
          Зарегистрироваться
        </Link>
      </p>
    </main>
  );
}
