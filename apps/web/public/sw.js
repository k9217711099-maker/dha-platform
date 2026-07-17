/*
 * Минимальный service worker гостевого сайта D H&A.
 *
 * Назначение — только сделать сайт устанавливаемым как PWA. Мы НИЧЕГО не кэшируем:
 * гостевой каталог (доступность, цены) читается из PMS в реальном времени, поэтому
 * запросы не перехватываем и не подменяем ответами из кэша.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// Обработчик fetch обязателен для критериев установки, но остаётся «сквозным».
self.addEventListener('fetch', () => {
  /* намеренно пусто: не вызываем respondWith — браузер грузит из сети как обычно */
});
