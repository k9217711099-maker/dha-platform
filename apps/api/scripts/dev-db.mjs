// Локальная БД для разработки без Docker/Homebrew: встроенный Postgres.
// Запуск: node scripts/dev-db.mjs (держать процесс запущенным).
import EmbeddedPostgres from 'embedded-postgres';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const databaseDir = resolve(here, '..', '.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'password',
  port: 5433,
  persistent: true,
});

// initdb запускаем только если кластер ещё не инициализирован,
// иначе на существующем .pgdata initdb падает ("directory ... not empty").
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('dha');
  console.log('БД "dha" создана');
} catch {
  console.log('БД "dha" уже существует');
}
console.log('Встроенный Postgres запущен на localhost:5433 (postgres/password)');

// Держим процесс живым
process.stdin.resume();
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
