'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export default function ProfilePage() {
  const router = useRouter();
  const { guest, loading, refreshProfile } = useAuth();

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
  const [tgResult, setTgResult] = useState<{ deepLink: string | null; token: string } | null>(null);
  const [tgError, setTgError] = useState<string | null>(null);

  // Редирект неавторизованных
  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  // Заполнить форму данными профиля
  useEffect(() => {
    if (guest) {
      setForm({
        firstName: guest.firstName ?? '',
        lastName: guest.lastName ?? '',
        middleName: guest.middleName ?? '',
        birthDate: guest.birthDate ? guest.birthDate.slice(0, 10) : '',
        citizenship: guest.citizenship ?? '',
      });
    }
  }, [guest]);

  if (loading || !guest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api.updateProfile({
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        middleName: form.middleName || undefined,
        birthDate: form.birthDate || undefined,
        citizenship: form.citizenship || undefined,
      });
      await refreshProfile();
      setStatus('Профиль сохранён');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMarketing(granted: boolean) {
    await api.updateMarketingConsent(granted);
    await refreshProfile();
  }

  async function connectTelegram() {
    setTgBusy(true);
    setTgError(null);
    try {
      const res = await api.aiTelegramLinkToken();
      setTgResult({ deepLink: res.deepLink, token: res.token });
      if (res.deepLink) window.open(res.deepLink, '_blank', 'noopener');
    } catch (err) {
      setTgError(err instanceof Error ? err.message : 'Не удалось создать ссылку');
    } finally {
      setTgBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-light text-ink">Профиль</h1>
        <p className="mt-1 text-sm text-dark-gray">
          {guest.email ?? guest.phone} · уровень лояльности:{' '}
          <span className="text-ink">{guest.loyaltyTier}</span>
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg text-ink">Личные данные</h2>
        {status && <p className="mb-4 text-sm text-dark-gray">{status}</p>}
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
          <Input
            id="lastName"
            label="Фамилия"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          <Input
            id="firstName"
            label="Имя"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <Input
            id="middleName"
            label="Отчество"
            value={form.middleName}
            onChange={(e) => setForm({ ...form, middleName: e.target.value })}
          />
          <Input
            id="birthDate"
            label="Дата рождения"
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          />
          <Input
            id="citizenship"
            label="Гражданство (код, напр. RU)"
            value={form.citizenship}
            onChange={(e) => setForm({ ...form, citizenship: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg text-ink">Согласия (152-ФЗ)</h2>
        <p className="text-sm text-dark-gray">
          Обработка персональных данных:{' '}
          <span className="text-ink">{guest.consents.PERSONAL_DATA ? 'дано' : 'не дано'}</span>
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-dark-gray">
          <input
            type="checkbox"
            checked={guest.consents.MARKETING}
            onChange={(e) => void toggleMarketing(e.target.checked)}
          />
          <span>Получать маркетинговые сообщения</span>
        </label>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg text-ink">Telegram-бот</h2>
        <p className="text-sm text-dark-gray">
          Подключите Telegram, чтобы AI-администратор мог подбирать номера, оформлять брони и
          оплату прямо в чате бота — от вашего имени.
        </p>
        <div className="mt-4">
          <Button type="button" onClick={() => void connectTelegram()} disabled={tgBusy}>
            {tgBusy ? 'Готовим ссылку…' : 'Подключить Telegram'}
          </Button>
        </div>
        {tgError && <p className="mt-3 text-sm text-dark-gray">{tgError}</p>}
        {tgResult && (
          <div className="mt-3 text-sm text-dark-gray">
            {tgResult.deepLink ? (
              <p>
                Открываем Telegram… Если не открылось,{' '}
                <a
                  href={tgResult.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline"
                >
                  перейдите по ссылке
                </a>{' '}
                и нажмите «Start». Ссылка действует 15 минут.
              </p>
            ) : (
              <p>
                Откройте нашего бота в Telegram и отправьте команду:{' '}
                <code className="rounded bg-beige px-1.5 py-0.5 text-ink">/start {tgResult.token}</code>
              </p>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
