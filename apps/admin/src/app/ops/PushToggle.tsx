'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';

/** base64url VAPID-ключ → Uint8Array для PushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Переключатель push-уведомлений сотрудника (Web Push): работает и при закрытой
 * вкладке — новая задача/напоминание/эскалация догоняют техника на телефоне.
 * На iPhone требуется добавить админку на экран «Домой» (PWA).
 */
export function PushToggle() {
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'busy' | 'denied'>('busy');

  const getReg = async () => navigator.serviceWorker.register('/sw.js');

  useEffect(() => {
    void (async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await getReg();
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? 'on' : 'off');
      } catch { setState('unsupported'); }
    })();
  }, []);

  const toggle = async () => {
    if (state !== 'on' && state !== 'off') return;
    const was = state;
    setState('busy');
    try {
      const reg = await getReg();
      if (was === 'off') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
        const { publicKey } = await adminApi.opsPushVapidKey();
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
        const json = sub.toJSON();
        await adminApi.opsPushSubscribe({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } });
        setState('on');
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await adminApi.opsPushUnsubscribe(sub.endpoint).catch(() => undefined);
          await sub.unsubscribe();
        }
        setState('off');
      }
    } catch {
      setState(was);
    }
  };

  if (state === 'unsupported') return null;
  if (state === 'denied') {
    return <span className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-400" title="Уведомления запрещены в настройках браузера — разрешите их для этого сайта">🔕 запрещены</span>;
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={state === 'busy'}
      title={state === 'on' ? 'Push включён на этом устройстве — уведомления приходят даже при закрытой вкладке' : 'Включить push-уведомления о задачах на этом устройстве'}
      className={`rounded-full px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${state === 'on' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
    >{state === 'on' ? '🔔 Push вкл' : state === 'busy' ? '…' : '🔕 Push выкл'}</button>
  );
}
