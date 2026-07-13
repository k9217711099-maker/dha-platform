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
      env: { NODE_ENV: 'production', PORT: 3001 },
      max_memory_restart: '600M',
    },
    {
      name: 'dha-web',
      cwd: path.join(root, 'apps/web'),
      // .bin/next — node-скрипт, PM2 запустит его интерпретатором node.
      // Порт берётся из env PORT (флаг -p в package.json тут не участвует).
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3000 },
      max_memory_restart: '600M',
    },
    {
      name: 'dha-admin',
      cwd: path.join(root, 'apps/admin'),
      script: 'node_modules/.bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3002 },
      max_memory_restart: '600M',
    },
  ],
};
