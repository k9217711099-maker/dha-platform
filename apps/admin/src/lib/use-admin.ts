'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, adminToken, type AdminMe } from './api';

/** Требует админ-токен: редиректит на /login при отсутствии. */
export function useRequireAdmin(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!adminToken.get()) router.replace('/login');
    else setReady(true);
  }, [router]);

  return ready;
}

/** Текущий сотрудник и его права (для скрытия разделов). */
export function useAdminMe(): AdminMe | null {
  const [me, setMe] = useState<AdminMe | null>(null);
  useEffect(() => {
    if (adminToken.get()) adminApi.me().then(setMe).catch(() => undefined);
  }, []);
  return me;
}
