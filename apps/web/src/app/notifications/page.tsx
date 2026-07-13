'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@dha/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import type { NotificationItem } from '../../lib/api-types';

const CHANNEL_LABEL: Record<string, string> = { PUSH: 'Push', EMAIL: 'Email', SMS: 'SMS' };

export default function NotificationsPage() {
  const router = useRouter();
  const { guest, loading } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) api.getNotifications().then(setItems).catch(() => setItems([]));
  }, [guest]);

  if (loading || !guest) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-light text-ink">Уведомления</h1>
      {items === null && <p className="text-dark-gray">Загрузка…</p>}
      {items?.length === 0 && <p className="text-dark-gray">Уведомлений пока нет.</p>}
      <div className="space-y-3">
        {items?.map((n) => (
          <Card key={n.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-ink">{n.title}</p>
                <p className="text-sm text-dark-gray">{n.body}</p>
              </div>
              <span className="shrink-0 text-xs text-dark-gray">
                {CHANNEL_LABEL[n.channel] ?? n.channel}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-dark-gray">
              {new Date(n.createdAt).toLocaleString('ru')}
            </p>
          </Card>
        ))}
      </div>
    </main>
  );
}
