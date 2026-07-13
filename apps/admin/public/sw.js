/* Service worker админки D H&A: приём Web Push о задачах (Операции). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/* Профили уведомлений по срочности: urgent — тройная вибрация и уведомление
   не исчезает само (аварийные/важные задачи, напоминания, эскалации). */
const VIBRATE_URGENT = [400, 150, 400, 150, 400];
const VIBRATE_NORMAL = [150];

self.addEventListener('push', (event) => {
  let data = { title: 'D H&A', body: '', url: '/ops/my', urgent: false, kind: '' };
  try { data = { ...data, ...event.data.json() }; } catch { /* текстовый payload */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url },
    // Срочные не схлопываем в один tag молча: renotify заставляет девайс сигналить повторно.
    tag: data.urgent ? `${data.url}#${Date.now()}` : data.url,
    renotify: !!data.urgent,
    requireInteraction: !!data.urgent,
    vibrate: data.urgent ? VIBRATE_URGENT : VIBRATE_NORMAL,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/ops/my';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
