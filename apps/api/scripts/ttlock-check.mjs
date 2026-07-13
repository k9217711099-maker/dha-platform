// Проверка реальной интеграции TTLock без подключения всего приложения.
// Заполните TTLOCK_* в apps/api/.env, затем:
//   node scripts/ttlock-check.mjs            # OAuth + список замков
//   node scripts/ttlock-check.mjs <lockId>   # + выдать тестовый PIN на 30 мин и удалить
import { createHash, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Подгружаем apps/api/.env (простой парсер)
try {
  const env = readFileSync(resolve(here, '..', '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env не обязателен, если переменные уже в окружении */
}

const BASE = process.env.TTLOCK_API_BASE ?? 'https://euapi.ttlock.com';
const clientId = process.env.TTLOCK_CLIENT_ID;
const clientSecret = process.env.TTLOCK_CLIENT_SECRET;
const username = process.env.TTLOCK_USERNAME;
const password = process.env.TTLOCK_PASSWORD;
const addType = Number(process.env.TTLOCK_ADD_TYPE ?? 3);

const md5 = (s) => createHash('md5').update(s).digest('hex');

function need(name, v) {
  if (!v) {
    console.error(`✗ Не задан ${name} в apps/api/.env`);
    process.exit(1);
  }
}
need('TTLOCK_CLIENT_ID', clientId);
need('TTLOCK_CLIENT_SECRET', clientSecret);
need('TTLOCK_USERNAME', username);
need('TTLOCK_PASSWORD', password);

async function post(path, params) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

async function main() {
  console.log(`→ Хост: ${BASE}`);

  // 1. OAuth
  const tok = await post('/oauth2/token', {
    clientId,
    clientSecret,
    grant_type: 'password',
    username,
    password: md5(password),
  });
  if (!tok.access_token) {
    console.error(`✗ OAuth не удался: ${tok.errmsg ?? JSON.stringify(tok)} (errcode ${tok.errcode})`);
    process.exit(1);
  }
  console.log(`✓ OAuth ок (uid ${tok.uid ?? '—'}, токен живёт ${tok.expires_in}s)`);
  const accessToken = tok.access_token;

  // 2. Список замков
  const list = await post('/v3/lock/list', {
    clientId,
    accessToken,
    pageNo: 1,
    pageSize: 50,
    date: Date.now(),
  });
  if (list.errcode) {
    console.error(`✗ Список замков: ${list.errmsg} (${list.errcode})`);
    process.exit(1);
  }
  const locks = list.list ?? [];
  console.log(`✓ Замков: ${locks.length}`);
  for (const l of locks) {
    console.log(`   • lockId=${l.lockId}  "${l.lockAlias}"  gateway=${l.hasGateway ? 'есть' : 'нет/неизв.'}`);
  }

  // 3. Тест PIN на конкретном замке
  const lockId = process.argv[2];
  if (!lockId) {
    console.log('\nЧтобы протестировать выдачу PIN: node scripts/ttlock-check.mjs <lockId>');
    return;
  }

  const mode = process.env.TTLOCK_PASSCODE_MODE ?? 'get';
  const start = Date.now();
  const end = start + 60 * 60_000; // 1 час
  let keyboardPwdId;
  let pin;

  if (mode === 'get') {
    console.log(`\n→ Прошу TTLock сгенерировать офлайн-код на замок ${lockId} (без шлюза, на 1 час)…`);
    const get = await post('/v3/keyboardPwd/get', {
      clientId,
      accessToken,
      lockId,
      keyboardPwdType: 3,
      startDate: start,
      endDate: end,
      date: Date.now(),
    });
    if (get.errcode) {
      console.error(`✗ Генерация кода: ${get.errmsg} (${get.errcode})`);
      console.error('  Проверьте: тип замка поддерживает офлайн-пароли, аккаунт владеет замком.');
      process.exit(1);
    }
    keyboardPwdId = get.keyboardPwdId;
    pin = get.keyboardPwd;
    console.log(`✓ Код сгенерирован системой: ${pin} (keyboardPwdId=${keyboardPwdId})`);
  } else {
    pin = randomInt(0, 1_000_000).toString().padStart(6, '0');
    console.log(`\n→ Пишу свой PIN ${pin} на замок ${lockId} (addType=${addType}, нужен шлюз/BT)…`);
    const add = await post('/v3/keyboardPwd/add', {
      clientId,
      accessToken,
      lockId,
      keyboardPwd: pin,
      keyboardPwdName: 'D H&A check',
      keyboardPwdType: 3,
      startDate: start,
      endDate: end,
      addType,
      date: Date.now(),
    });
    if (add.errcode) {
      console.error(`✗ Запись PIN: ${add.errmsg} (${add.errcode})`);
      console.error('  Частые причины: нет шлюза (для addType=3), замок не онлайн.');
      process.exit(1);
    }
    keyboardPwdId = add.keyboardPwdId;
    console.log(`✓ PIN записан: keyboardPwdId=${keyboardPwdId}, код=${pin}`);
  }

  console.log(`→ Пробую удалить код (необязательно — офлайн-код истечёт сам через час)…`);
  const del = await post('/v3/keyboardPwd/delete', {
    clientId,
    accessToken,
    lockId,
    keyboardPwdId,
    deleteType: 2,
    date: Date.now(),
  });
  if (del.errcode) {
    console.log(`  (удаление не прошло: ${del.errmsg} — для офлайн-кода это нормально без шлюза, код истечёт по времени)`);
  } else {
    console.log('✓ Код удалён.');
  }
  console.log('\n✓ Готово. OAuth, доступ к замку и выдача кода работают.');
}

main().catch((e) => {
  console.error('✗ Ошибка:', e.message);
  process.exit(1);
});
