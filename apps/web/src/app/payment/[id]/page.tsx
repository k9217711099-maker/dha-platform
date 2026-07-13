'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@dha/ui';
import { api } from '../../../lib/api';
import { ymGoal } from '../../../lib/metrika';

function PaymentInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const amount = params.get('amount');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await api.simulatePayment(id);
      ymGoal('payment_success', { amount: amount ? Number(amount) : undefined });
      router.push('/bookings?paid=1');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка оплаты');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm text-dark-gray">Демо-режим оплаты (mock-провайдер).</p>
      {amount && <p className="mt-2 text-2xl text-ink">{Number(amount).toLocaleString('ru')} ₽</p>}
      <p className="mt-1 text-xs text-dark-gray">
        В проде здесь будет переход на страницу YooKassa. Чек 54-ФЗ формируется автоматически.
      </p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <Button onClick={() => void pay()} disabled={busy} className="mt-4 w-full">
        {busy ? 'Оплачиваем…' : 'Оплатить (демо)'}
      </Button>
    </Card>
  );
}

export default function PaymentPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-4 text-3xl font-light text-ink">Оплата</h1>
      <Suspense fallback={<p className="text-dark-gray">Загрузка…</p>}>
        <PaymentInner />
      </Suspense>
    </main>
  );
}
