// Сквозной E2E-прогон ядра Пути B (DHP) на живом стеке — единый smoke по всем спринтам.
// Требует поднятую БД (:5433), API (:3001) и применённый seed. Без внешних зависимостей.
// Запуск: node apps/api/scripts/e2e-dhp.mjs   (переопределить хост: API_BASE=... )
//
// Проверяет: health → логин → доступность → quote → бронь PMS (идемпотентно) →
// анти-овербукинг (409) → ограничение тарифа (422 с кодом) → RBAC (403) →
// гостевой Booking Engine + оплата (webhook → CONFIRMED) → Channel Manager
// (синк с ретраем, приём OTA + дедуп) → операции (выезд → задача уборки; техблок → −1
// к доступности → закрытие). Печатает PASS/FAIL по шагам; ненулевой код при провале.

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';

// ─── Мини-харнесс ───
let passed = 0;
let failed = 0;
const cleanup = []; // booking ids к отмене в конце (освобождаем инвентарь)

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, label) {
  assert(actual === expected, `${label}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
}
async function step(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

// ─── HTTP ───
function qs(obj) {
  const p = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return p.length ? `?${p.join('&')}` : '';
}
async function http(method, path, { token, idem, channelToken, body } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (idem) headers['idempotency-key'] = idem;
  if (channelToken) headers['x-channel-token'] = channelToken;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

// ─── Даты: будущее окно внутри посеянного ценового диапазона (2026-07-01 … 2027-07-01) ───
const BASE_DAY = Date.UTC(2026, 9, 1); // 2026-10-01
const runShift = Math.floor(Date.now() / 60000) % 150; // сдвиг окна каждую минуту — переносимость между прогонами
const day = (n) => new Date(BASE_DAY + (runShift + n) * 86400000).toISOString().slice(0, 10);

async function main() {
  console.log(`\nDHP E2E → ${BASE}  (окно дат от ${day(0)})\n`);

  // ── Setup: логины и справочники ──
  const login = async (email, password) => {
    const r = await http('POST', '/admin/auth/login', { body: { email, password } });
    assert(r.status === 201 || r.status === 200, `логин ${email} → ${r.status}`);
    return r.json.accessToken;
  };
  let owner, frontdesk, engineer, guest, propertyId, roomTypeId, ratePlanId, roomA;

  await step('health', async () => {
    const r = await http('GET', '/health');
    eq(r.status, 200, 'health status');
    return 'ok';
  });

  await step('setup: логины (owner/frontdesk/engineer) + гость', async () => {
    owner = await login('owner@dha.local', 'owner12345');
    frontdesk = await login('frontdesk@dha.local', 'front12345');
    engineer = await login('pmsengineer@dha.local', 'eng12345');
    const email = `e2e.guest.${Date.now()}@dha.local`;
    const r = await http('POST', '/auth/register', { body: { email, password: 'guest12345', acceptPersonalData: true } });
    assert(r.status === 201 || r.status === 200, `регистрация гостя → ${r.status}`);
    guest = r.json.accessToken;
    assert(owner && frontdesk && engineer && guest, 'не все токены получены');
    return 'токены получены';
  });

  await step('setup: справочники (объект, категория, тариф FLEX, номер)', async () => {
    const plans = await http('GET', '/v1/rate-plans', { token: owner });
    eq(plans.status, 200, 'rate-plans status');
    const flex = plans.json.find((p) => p.code === 'FLEX') ?? plans.json[0];
    assert(flex, 'тариф FLEX не найден — запустите seed');
    ratePlanId = flex.id;
    propertyId = flex.propertyId;
    const rooms = await http('GET', `/v1/rooms${qs({ propertyId })}`, { token: owner });
    eq(rooms.status, 200, 'rooms status');
    assert(rooms.json.length > 0, 'нет номеров — запустите seed');
    roomA = rooms.json[0].id;
    roomTypeId = rooms.json[0].roomType?.id ?? rooms.json[0].roomTypeId;
    assert(propertyId && roomTypeId && ratePlanId && roomA, 'справочники неполные');
    return `${rooms.json.length} номеров`;
  });

  if (!(owner && propertyId && roomTypeId && ratePlanId)) {
    console.log('\n✗ setup провалился — дальнейшие шаги пропущены. Проверьте БД/seed.\n');
    process.exit(1);
  }

  const searchAvail = async (ci, co) => {
    const r = await http('GET', `/v1/availability/search${qs({ propertyId, roomTypeId, checkIn: ci, checkOut: co })}`, { token: owner });
    eq(r.status, 200, 'availability status');
    const row = r.json.find((x) => x.roomTypeId === roomTypeId) ?? r.json[0];
    return row?.available ?? 0;
  };
  const createPmsBooking = async (ci, co, idem) => {
    const r = await http('POST', '/v1/bookings', {
      token: owner,
      idem: idem ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      // Гость админ-брони задаётся контактами (в гостевом движке — из JWT). Один и тот же
      // email → resolveGuest вернёт того же гостя, без дублей.
      body: { propertyId, roomTypeId, ratePlanId, checkIn: ci, checkOut: co, guests: 2, firstName: 'E2E', lastName: 'PMS', email: 'e2e.pms@dha.local' },
    });
    return r;
  };

  // ── 1. Доступность + quote (Rate Engine) ──
  await step('availability + quote', async () => {
    const avail = await searchAvail(day(10), day(12));
    assert(avail >= 1, `нет доступности на окно (available=${avail})`);
    const r = await http('GET', `/v1/rates/quote${qs({ propertyId, roomTypeId, ratePlanId, checkIn: day(10), checkOut: day(12), guests: 2 })}`, { token: owner });
    eq(r.status, 200, 'quote status');
    eq(r.json.nightsCount, 2, 'ночей в quote');
    assert(r.json.totalAmount > 0, 'totalAmount должен быть > 0');
    return `avail=${avail}, 2 ночи = ${r.json.totalAmount} ₽`;
  });

  // ── 2. Создание брони PMS + идемпотентность ──
  await step('бронь PMS + идемпотентность (тот же ключ → та же бронь)', async () => {
    const idem = `e2e-idem-${Date.now()}`;
    const r1 = await createPmsBooking(day(11), day(13), idem);
    eq(r1.status, 201, 'создание брони');
    eq(r1.json.status, 'CONFIRMED', 'статус новой брони');
    cleanup.push(r1.json.id);
    const r2 = await createPmsBooking(day(11), day(13), idem);
    assert(r2.status === 201 || r2.status === 200, `повтор → ${r2.status}`);
    eq(r2.json.id, r1.json.id, 'идемпотентный повтор вернул ту же бронь');
    return `бронь ${r1.json.bookingNumber}`;
  });

  // ── 3. Анти-овербукинг: заполнить пул, следующая → 409 ──
  await step('анти-овербукинг: заполнение пула → 409 на следующую', async () => {
    const ci = day(14);
    const co = day(16);
    const avail = await searchAvail(ci, co);
    assert(avail >= 1, `нет доступности для теста (available=${avail})`);
    for (let i = 0; i < avail; i++) {
      const r = await createPmsBooking(ci, co);
      eq(r.status, 201, `бронь ${i + 1}/${avail}`);
      cleanup.push(r.json.id);
    }
    const after = await searchAvail(ci, co);
    eq(after, 0, 'доступность после заполнения');
    const overflow = await createPmsBooking(ci, co);
    eq(overflow.status, 409, 'бронь сверх пула должна быть отклонена');
    return `пул=${avail}, овербукинг заблокирован`;
  });

  // ── 4. Ограничение тарифа: stop-sell → quote 422 с кодом ──
  await step('ограничение stop-sell → quote 422 (code=stop_sell_active)', async () => {
    const d = day(20);
    const set = await http('PUT', '/v1/rates/restrictions', { token: owner, body: { ratePlanId, roomTypeId, from: d, to: day(21), stopSell: true } });
    assert(set.status === 200 || set.status === 201, `установка ограничения → ${set.status}`);
    try {
      const q = await http('GET', `/v1/rates/quote${qs({ propertyId, roomTypeId, ratePlanId, checkIn: d, checkOut: day(21), guests: 2 })}`, { token: owner });
      eq(q.status, 422, 'quote при stop-sell');
      eq(q.json.code, 'stop_sell_active', 'машинный код ошибки');
    } finally {
      await http('PUT', '/v1/rates/restrictions', { token: owner, body: { ratePlanId, roomTypeId, from: d, to: day(21), stopSell: false } });
    }
    return 'закрытие продаж отражается в quote';
  });

  // ── 5. RBAC: front desk без pms_channels → 403 ──
  await step('RBAC: front desk → /channels 403', async () => {
    const r = await http('GET', '/v1/channels', { token: frontdesk });
    eq(r.status, 403, 'front desk не имеет pms_channels');
    return 'право enforced';
  });

  // ── 6. Гостевой Booking Engine + оплата ──
  await step('booking engine: quote + бронь (pending) удерживает инвентарь', async () => {
    const q = await http('POST', '/v1/booking-engine/quote', { token: guest, body: { propertyId, roomTypeId, ratePlanId, checkIn: day(30), checkOut: day(32), guests: 2 } });
    eq(q.status, 201, 'guest quote');
    assert(q.json.payableAmount >= 0, 'payableAmount');
    const before = await searchAvail(day(30), day(32));
    const c = await http('POST', '/v1/booking-engine/bookings', { token: guest, idem: `e2e-ge-${Date.now()}`, body: { propertyId, roomTypeId, ratePlanId, checkIn: day(30), checkOut: day(32), guests: 2 } });
    eq(c.status, 201, 'создание гостевой брони');
    const booking = c.json.booking;
    eq(booking.status, 'PENDING', 'гостевая бронь pending_payment');
    const after = await searchAvail(day(30), day(32));
    eq(after, before - 1, 'PENDING-бронь удерживает инвентарь (−1)');
    // оплата: подтверждаем через webhook (dev использует реальный тест-YooKassa)
    const gatewayId = c.json.payment?.gatewayPaymentId;
    if (gatewayId) {
      const wh = await http('POST', '/payments/webhook', { body: { event: 'payment.succeeded', object: { id: gatewayId, status: 'succeeded' } } });
      assert(wh.status === 200 || wh.status === 201, `webhook → ${wh.status}`);
      const view = await http('GET', `/v1/bookings/${booking.id}`, { token: owner });
      eq(view.json.status, 'CONFIRMED', 'после оплаты бронь подтверждена');
      cleanup.push(booking.id);
      return 'quote → pending → оплата → CONFIRMED';
    }
    cleanup.push(booking.id);
    return 'pending удерживает инвентарь (платёжный шлюз недоступен в dev — webhook пропущен)';
  });

  // ── 7. Операции: выезд → задача уборки; техблок → −1 доступность ──
  await step('операции: выезд → авто-задача уборки + номер DIRTY', async () => {
    // Окно случайное: бронь после check-out остаётся CHECKED_OUT (отменить нельзя) и держит
    // инвентарь — фиксированные даты «забиваются» за несколько прогонов e2e в один день.
    // Диапазон ограничен ценовым календарём сида: runShift(≤149) + n + 2 ≤ 272 дня от BASE_DAY.
    const opsBase = 40 + Math.floor(Math.random() * 60);
    const c = await createPmsBooking(day(opsBase), day(opsBase + 2));
    eq(c.status, 201, 'бронь под операции');
    const ci = await http('POST', `/v1/bookings/${c.json.id}/check-in`, { token: owner, body: { roomId: roomA } });
    eq(ci.status, 201, 'заезд с назначением номера');
    const co = await http('POST', `/v1/bookings/${c.json.id}/check-out`, { token: owner });
    eq(co.status, 201, 'выезд');
    const tasks = await http('GET', `/v1/ops/tasks${qs({ propertyId, kind: 'CLEANING' })}`, { token: owner });
    eq(tasks.status, 200, 'список уборок');
    const task = tasks.json.find((t) => t.bookingId === c.json.id);
    assert(task, 'на выезд должна создаться уборка');
    eq(task.kind, 'CLEANING', 'вид задачи');
    eq(task.status, 'NEW', 'уборка видна сразу (NEW)');
    // Вернуть бронь в отменяемое состояние (CHECKED_OUT нельзя отменить), иначе она
    // навсегда держит инвентарь и прогоны копят занятость: reopen → revert → cancel в cleanup.
    const ro = await http('POST', `/v1/bookings/${c.json.id}/reopen`, { token: owner });
    eq(ro.status, 201, 'reopen после выезда');
    const rv = await http('POST', `/v1/bookings/${c.json.id}/revert-check-in`, { token: owner });
    eq(rv.status, 201, 'возврат на «Проверено»');
    cleanup.push(c.json.id);
    return `уборка «${task.title}» создана автоматически`;
  });

  await step('операции: техблок (blocksSale) → −1 к доступности → закрытие восстанавливает', async () => {
    const ci = day(40);
    const co = day(42);
    const before = await searchAvail(ci, co);
    assert(before >= 1, `нет доступности для теста техблока (${before})`);
    const rep = await http('POST', '/v1/ops/tasks', { token: owner, body: { roomId: roomA, title: 'E2E: течёт кран', severity: 'MAJOR', blocksSale: true } });
    eq(rep.status, 201, 'создание инженерной задачи');
    const during = await searchAvail(ci, co);
    eq(during, before - 1, 'техблок уменьшает доступность');
    const st = await http('POST', `/v1/ops/tasks/${rep.json.id}/status`, { token: owner, body: { to: 'IN_PROGRESS' } });
    eq(st.status, 201, 'задача в работе');
    const res = await http('POST', `/v1/ops/tasks/${rep.json.id}/status`, { token: owner, body: { to: 'DONE' } });
    eq(res.status, 201, 'закрытие задачи');
    const restored = await searchAvail(ci, co);
    eq(restored, before, 'после закрытия доступность восстановлена');
    return `${before} → ${during} → ${restored}`;
  });

  await step('RBAC: инженер → /ops/cleaning/plan 403', async () => {
    const r = await http('GET', '/v1/ops/cleaning/plan', { token: engineer });
    eq(r.status, 403, 'инженер не имеет ops_cleaning_plan');
    return 'право enforced';
  });

  // ── 8. Channel Manager: синк (ретрай) + приём OTA (дедуп) ──
  let otaChannelId;
  await step('channel: канал (mode=ok) + маппинги объекта/категории/тарифа', async () => {
    const list = await http('GET', '/v1/channels', { token: owner });
    eq(list.status, 200, 'список каналов');
    let ch = list.json.find((c) => c.code === 'e2e-ota');
    if (!ch) {
      const created = await http('POST', '/v1/channels', { token: owner, body: { code: 'e2e-ota', name: 'E2E OTA', kind: 'OTA', active: true, credentials: { token: 'e2e-ota-token', mode: 'ok' } } });
      eq(created.status, 201, 'создание канала');
      ch = created.json;
    }
    otaChannelId = ch.id;
    for (const [kind, remote, local] of [['property', 'E2E-PROP', propertyId], ['room-type', 'E2E-RT', roomTypeId], ['rate-plan', 'E2E-RATE', ratePlanId]]) {
      const m = await http('PUT', `/v1/channels/${otaChannelId}/mappings/${kind}`, { token: owner, body: { localId: local, remoteId: remote } });
      assert(m.status === 200 || m.status === 201, `маппинг ${kind} → ${m.status}`);
    }
    return 'канал и маппинги готовы';
  });

  await step('channel: сбой синка → RETRY_SCHEDULED (не ломает PMS)', async () => {
    const list = await http('GET', '/v1/channels', { token: owner });
    let ch = list.json.find((c) => c.code === 'e2e-fail');
    if (!ch) {
      const created = await http('POST', '/v1/channels', { token: owner, body: { code: 'e2e-fail', name: 'E2E Fail', kind: 'OTA', active: true, credentials: { token: 'x', mode: 'fail' } } });
      eq(created.status, 201, 'создание fail-канала');
      ch = created.json;
    }
    await http('PUT', `/v1/channels/${ch.id}/mappings/property`, { token: owner, body: { localId: propertyId, remoteId: 'E2E-FAIL-PROP' } });
    const enq = await http('POST', `/v1/channels/${ch.id}/sync`, { token: owner, body: { propertyId, jobType: 'AVAILABILITY' } });
    assert(enq.status === 200 || enq.status === 201, `постановка джоба → ${enq.status}`);
    const run = await http('POST', '/v1/channels/run-sync', { token: owner });
    assert(run.status === 200 || run.status === 201, `run-sync → ${run.status}`);
    const jobs = await http('GET', `/v1/channels/${ch.id}/sync-jobs`, { token: owner });
    const job = jobs.json[0];
    assert(job, 'джоб не найден');
    assert(['RETRY_SCHEDULED', 'DEAD_LETTER'].includes(job.status), `ожидался ретрай/dead-letter, статус ${job.status}`);
    assert(job.errorCode, 'ошибка должна быть зафиксирована');
    return `статус ${job.status}, errorCode=${job.errorCode}`;
  });

  await step('channel: приём OTA-брони + дедуп (тот же external_booking_id)', async () => {
    const ext = `E2E-OTA-${Date.now()}`;
    const payload = {
      external_booking_id: ext,
      property_id: 'E2E-PROP',
      room_type_id: 'E2E-RT',
      rate_plan_id: 'E2E-RATE',
      arrival_date: day(45),
      departure_date: day(47),
      adults: 2,
      guest: { first_name: 'OTA', last_name: 'Гость', email: `ota.${Date.now()}@example.com` },
      price: { total: 16000, currency: 'RUB' },
    };
    // id брони: при первом приёме — в booking.id; при дубле — в channelBooking.bookingId.
    const otaBookingId = (j) => j?.booking?.id ?? j?.channelBooking?.bookingId ?? j?.id;
    const first = await http('POST', `/v1/channels/${otaChannelId}/ingest/booking`, { channelToken: 'e2e-ota-token', body: payload });
    assert(first.status === 201 || first.status === 200, `приём OTA → ${first.status} ${JSON.stringify(first.json)}`);
    const id1 = otaBookingId(first.json);
    assert(id1, `в ответе нет id брони: ${JSON.stringify(first.json)}`);
    cleanup.push(id1);
    const second = await http('POST', `/v1/channels/${otaChannelId}/ingest/booking`, { channelToken: 'e2e-ota-token', body: payload });
    assert(second.status === 201 || second.status === 200, `повторный приём → ${second.status}`);
    assert(second.json.duplicate === true, 'повтор должен быть помечен duplicate');
    const id2 = otaBookingId(second.json);
    eq(id2, id1, 'дедуп: повтор по external_booking_id вернул ту же бронь');
    return `OTA-бронь принята, дубль отсеян`;
  });

  // ── Cleanup: освобождаем инвентарь (отмена созданных occupying-броней) ──
  let cancelled = 0;
  for (const id of cleanup) {
    const r = await http('POST', `/v1/bookings/${id}/cancel`, { token: owner, body: { reason: 'E2E cleanup' } });
    if (r.status === 200 || r.status === 201) cancelled++;
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'}  DHP E2E: ${passed} passed, ${failed} failed  (очищено броней: ${cancelled}/${cleanup.length})\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nФатальная ошибка E2E:', e);
  process.exit(1);
});
