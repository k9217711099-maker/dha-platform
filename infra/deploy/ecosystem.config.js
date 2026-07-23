// PM2: процессы D H&A на сервере (api + web + admin).
// mobile (Expo) сюда не входит — деплоится отдельно через сборки/сторы.
// Порты фиксированы и одинаковы на staging и production (окружения — разные серверы).
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

module.exports = {
  apps: [
    {
      name: 'dha-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/main.js',
      // PASSPORT_PROVIDER закреплён здесь (а не только в .env): роутер читает его из
      // process.env, а pm2 кладёт env отсюда при каждом старте — провайдер переживает
      // деплой без зависимости от порядка чтения .env. Ключи Yandex — в apps/api/.env.
      env: { NODE_ENV: 'production', PORT: 3001, PASSPORT_PROVIDER: 'yandex' },
      max_memory_restart: '600M',
    },
    {
      name: 'dha-web',
      cwd: path.join(root, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3000 },
      max_memory_restart: '600M',
    },
    {
      name: 'dha-admin',
      cwd: path.join(root, 'apps/admin'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3002 },
      max_memory_restart: '600M',
    },
  ],
};
