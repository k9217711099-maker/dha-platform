// PM2: процессы D H&A на сервере (api + web + admin).
// mobile (Expo) сюда не входит — деплоится отдельно через сборки/сторы.
// Порты фиксированы и одинаковы на staging и production (окружения — разные серверы).
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..', '..');

// Читаем apps/api/.env и кладём ВСЕ переменные в env процесса api. Причина: на боевом
// окружении @nestjs/config (config.get) ненадёжно отдавал значения, дописанные в .env в
// рантайме (PASSPORT_PROVIDER, ключи Yandex). Через process.env — читается всегда. pm2
// вычисляет env отсюда при каждом старте/деплое, так что ключи не слетают.
function loadEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* нет файла (напр. локально) — не критично */
  }
  return out;
}

module.exports = {
  apps: [
    {
      name: 'dha-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/main.js',
      // Сначала весь .env, затем жёстко NODE_ENV/PORT (они не должны переопределяться).
      env: { ...loadEnvFile(path.join(root, 'apps/api/.env')), NODE_ENV: 'production', PORT: 3001 },
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
