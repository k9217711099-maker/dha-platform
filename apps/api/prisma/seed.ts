// Сид для разработки: арендатор, администраторы (в т.ч. роли PMS), промокод и
// самодостаточный демо-объект собственного PMS (Путь B) с номерным фондом.
// Запуск: corepack pnpm --filter @dha/api exec prisma db seed
import { type BookingStatus, type PaymentStatus, PrismaClient, PromocodeType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AMENITY_CATALOG, amenityCode } from './amenities-catalog';

const prisma = new PrismaClient();

/** Демо-пользователи PMS (роли DHP §5). roleKey совпадает с DEFAULT_ROLES. */
const PMS_USERS = [
  { email: 'owner@dha.local', password: 'owner12345', name: 'Владелец / Управляющий', roleKey: 'pms_owner' },
  { email: 'gm@dha.local', password: 'gm12345', name: 'General Manager', roleKey: 'pms_gm' },
  { email: 'frontdesk@dha.local', password: 'front12345', name: 'Front Desk', roleKey: 'pms_frontdesk' },
  { email: 'revenue@dha.local', password: 'rev12345', name: 'Revenue Manager', roleKey: 'pms_revenue' },
  { email: 'hk@dha.local', password: 'hk12345', name: 'Housekeeping Supervisor', roleKey: 'pms_hk_supervisor' },
  { email: 'pmsengineer@dha.local', password: 'eng12345', name: 'Инженер (PMS)', roleKey: 'pms_engineer' },
];

async function main() {
  // 1. Дефолтный арендатор (мультиарендность DHP; пока один оператор — D H&A).
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dha' },
    update: {},
    create: { slug: 'dha', name: 'D Hotels & Apartments' },
  });
  console.log(`Арендатор готов: ${tenant.name}`);

  // 2. Первый администратор.
  const email = process.env.ADMIN_EMAIL ?? 'admin@dha.local';
  const password = process.env.ADMIN_PASSWORD ?? 'admin12345';
  await prisma.adminUser.upsert({
    where: { email },
    update: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name: 'Администратор',
      role: 'ADMIN',
      roleKey: 'superadmin',
    },
  });
  console.log(`Администратор готов: ${email}`);

  // 3. Демо-пользователи PMS (роли создаются при старте API — RolesService).
  for (const u of PMS_USERS) {
    await prisma.adminUser.upsert({
      where: { email: u.email },
      update: { tenantId: tenant.id, roleKey: u.roleKey },
      create: {
        tenantId: tenant.id,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        name: u.name,
        role: 'MANAGER',
        roleKey: u.roleKey,
      },
    });
  }
  console.log(`PMS-пользователи готовы: ${PMS_USERS.map((u) => u.email).join(', ')}`);

  // 4. Промокод.
  await prisma.promocode.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: { code: 'WELCOME10', type: PromocodeType.PERCENT, value: 10 },
  });
  console.log('Промокод WELCOME10 (−10%) готов');

  // 5. Демо-объект собственного PMS (Путь B: каталог — наш, без Bnovo) + номерной фонд.
  let property = await prisma.property.findFirst({ where: { tenantId: tenant.id, name: 'Апартаменты на Рубинштейна' } });
  if (!property) {
    property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        name: 'Апартаменты на Рубинштейна',
        type: 'ONE_BEDROOM',
        kind: 'APARTMENT',
        district: 'NEVSKY_PROSPECT',
        address: 'Санкт-Петербург, ул. Рубинштейна, 26',
        amenities: ['wifi', 'kitchen'],
        features: ['self_checkin'],
        photos: [],
        checkInTime: '15:00',
        checkOutTime: '12:00',
      },
    });
  }
  let roomType = await prisma.roomType.findFirst({ where: { propertyId: property.id, name: 'Апартаменты с одной спальней' } });
  if (!roomType) {
    roomType = await prisma.roomType.create({
      data: {
        tenantId: tenant.id,
        propertyId: property.id,
        name: 'Апартаменты с одной спальней',
        capacity: 3,
        bedType: 'double',
        amenities: ['wifi', 'kitchen'],
        photos: [],
      },
    });
  }
  const demoRooms = ['101', '102', '201', '202'];
  for (const number of demoRooms) {
    const exists = await prisma.room.findFirst({ where: { propertyId: property.id, number } });
    if (!exists) {
      await prisma.room.create({
        data: {
          tenantId: tenant.id,
          propertyId: property.id,
          roomTypeId: roomType.id,
          number,
          floor: number.startsWith('1') ? '1' : '2',
        },
      });
    }
  }
  console.log(`Демо-объект PMS готов: ${property.name} (${demoRooms.length} номеров)`);

  // 6. Демо-тарифы (Rate Engine, Sprint 4): базовый «Гибкий» + производный «Невозвратный» (−10%).
  const flex = await prisma.ratePlan.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'FLEX' } },
    update: {},
    create: { tenantId: tenant.id, propertyId: property.id, name: 'Гибкий тариф', code: 'FLEX', kind: 'FLEXIBLE', refundable: true },
  });
  await prisma.ratePlan.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'NONREF' } },
    update: {},
    create: {
      tenantId: tenant.id, propertyId: property.id, name: 'Невозвратный (−10%)', code: 'NONREF', kind: 'NON_REFUNDABLE',
      refundable: false, parentRatePlanId: flex.id, adjustmentType: 'PERCENT', adjustmentValue: -10,
    },
  });
  // Цены базового тарифа: 8000 ₽/ночь на год вперёд от 2026-07-01 (производный считается −10%).
  const DAY = 86_400_000;
  const start = Date.UTC(2026, 6, 1);
  const prices = [];
  for (let i = 0; i < 365; i++) {
    prices.push({ tenantId: tenant.id, ratePlanId: flex.id, roomTypeId: roomType.id, date: new Date(start + i * DAY), price: 8000 });
  }
  await prisma.ratePrice.createMany({ data: prices, skipDuplicates: true });
  console.log('Демо-тарифы готовы: Гибкий (8000 ₽/ночь) + Невозвратный (−10% → 7200)');

  // 7. Демо-ограничение (Rate Engine): min-stay 2 на пятницу 2026-07-03 — показ 422 в quote при 1 ночи.
  const restrDate = new Date(Date.UTC(2026, 6, 3));
  await prisma.restriction.upsert({
    where: { ratePlanId_roomTypeId_date: { ratePlanId: flex.id, roomTypeId: roomType.id, date: restrDate } },
    update: {},
    create: { tenantId: tenant.id, ratePlanId: flex.id, roomTypeId: roomType.id, date: restrDate, minStay: 2 },
  });
  console.log('Демо-ограничение готово: min-stay 2 на 2026-07-03');

  // 8. Демо-канал (Channel Manager): Ostrovok (mock, mode=ok) + маппинги объекта/категории/тарифа.
  const channel = await prisma.channel.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ostrovok' } },
    update: {},
    create: {
      tenantId: tenant.id, code: 'ostrovok', name: 'Ostrovok', kind: 'OTA', status: 'CONNECTED',
      active: true, credentials: { token: 'demo-ostrovok-token', mode: 'ok' },
    },
  });
  const pm = await prisma.channelPropertyMapping.findFirst({ where: { channelId: channel.id, propertyId: property.id } });
  if (!pm) await prisma.channelPropertyMapping.create({ data: { tenantId: tenant.id, channelId: channel.id, propertyId: property.id, remotePropertyId: 'OSTR-PROP-1' } });
  const rtm = await prisma.channelRoomTypeMapping.findFirst({ where: { channelId: channel.id, roomTypeId: roomType.id } });
  if (!rtm) await prisma.channelRoomTypeMapping.create({ data: { tenantId: tenant.id, channelId: channel.id, roomTypeId: roomType.id, remoteRoomTypeId: 'OSTR-RT-1' } });
  const rpm = await prisma.channelRatePlanMapping.findFirst({ where: { channelId: channel.id, ratePlanId: flex.id } });
  if (!rpm) await prisma.channelRatePlanMapping.create({ data: { tenantId: tenant.id, channelId: channel.id, ratePlanId: flex.id, remoteRatePlanId: 'OSTR-RATE-1' } });
  console.log(`Демо-канал готов: ${channel.name} (+ маппинги объекта/категории/тарифа)`);

  // 9. Демо-гость для сценарных броней.
  const guest = await prisma.guest.upsert({
    where: { email: 'guest.demo@dha.local' },
    update: { tenantId: tenant.id },
    create: { tenantId: tenant.id, email: 'guest.demo@dha.local', emailVerified: true, firstName: 'Демо', lastName: 'Гость' },
  });

  // 10. Брони во всех 4 состояниях раздела «Мои бронирования» (§7). Прямая вставка (демо-данные).
  const rooms = await prisma.room.findMany({ where: { propertyId: property.id }, orderBy: { number: 'asc' } });
  const roomByNumber = (n: string) => rooms.find((r) => r.number === n);
  const demoBookings: {
    number: string; status: BookingStatus; paymentStatus: PaymentStatus;
    checkIn: Date; checkOut: Date; roomNo: string | null; cancelReason: string | null;
  }[] = [
    { number: 'DHA-DEMO-CUR', status: 'CHECKED_IN', paymentStatus: 'PAID', checkIn: new Date(Date.UTC(2026, 6, 1)), checkOut: new Date(Date.UTC(2026, 6, 4)), roomNo: '101', cancelReason: null },
    { number: 'DHA-DEMO-UPC', status: 'CONFIRMED', paymentStatus: 'PAID', checkIn: new Date(Date.UTC(2026, 6, 20)), checkOut: new Date(Date.UTC(2026, 6, 23)), roomNo: null, cancelReason: null },
    { number: 'DHA-DEMO-PAST', status: 'CHECKED_OUT', paymentStatus: 'PAID', checkIn: new Date(Date.UTC(2026, 5, 20)), checkOut: new Date(Date.UTC(2026, 5, 24)), roomNo: '201', cancelReason: null },
    { number: 'DHA-DEMO-CANC', status: 'CANCELLED', paymentStatus: 'REFUNDED', checkIn: new Date(Date.UTC(2026, 6, 10)), checkOut: new Date(Date.UTC(2026, 6, 12)), roomNo: null, cancelReason: 'Изменились планы' },
  ];
  for (const b of demoBookings) {
    const nights = Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / DAY);
    await prisma.booking.upsert({
      where: { bookingNumber: b.number },
      update: {},
      create: {
        tenantId: tenant.id, bookingNumber: b.number, guestId: guest.id, propertyId: property.id, roomTypeId: roomType.id,
        roomId: b.roomNo ? (roomByNumber(b.roomNo)?.id ?? null) : null,
        status: b.status, paymentStatus: b.paymentStatus, channel: 'WEBSITE',
        checkIn: b.checkIn, checkOut: b.checkOut, nights, guests: 2,
        ratePlanId: flex.id, ratePlanName: 'Гибкий тариф', refundable: true, totalPrice: nights * 8000,
        cancelReason: b.cancelReason,
      },
    });
  }
  console.log('Демо-брони готовы: текущая / предстоящая / прошлая / отменённая');

  // 11. Задачи и Уборка (TASKS-HOUSEKEEPING-TZ): пресеты типов уборок, правило «выезд →
  //     выездная», демо-уборка (№201) и закрытая инженерная задача (№202).
  const typePresets = [
    { presetKey: 'departure', name: 'Выездная', color: '#f59e0b' },
    { presetKey: 'stayover', name: 'Текущая', color: '#0ea5e9' },
    { presetKey: 'occupied', name: 'Жилая', color: '#10b981' },
  ];
  for (const p of typePresets) {
    const existing = await prisma.cleaningType.findFirst({ where: { tenantId: tenant.id, presetKey: p.presetKey } });
    if (!existing) await prisma.cleaningType.create({ data: { tenantId: tenant.id, ...p } });
  }
  const departureType = await prisma.cleaningType.findFirst({ where: { tenantId: tenant.id, presetKey: 'departure' } });
  if (departureType) {
    const rule = await prisma.cleaningRule.findFirst({ where: { tenantId: tenant.id, condition: 'TODAY_CHECKOUT' } });
    if (!rule) await prisma.cleaningRule.create({ data: { tenantId: tenant.id, cleaningTypeId: departureType.id, condition: 'TODAY_CHECKOUT' } });
  }
  const pastRoom = roomByNumber('201');
  if (pastRoom && departureType) {
    const hk = await prisma.opsTask.findFirst({ where: { roomId: pastRoom.id, kind: 'CLEANING' } });
    if (!hk) {
      await prisma.opsTask.create({
        data: {
          tenantId: tenant.id, kind: 'CLEANING', status: 'NEW', title: departureType.name,
          propertyId: property.id, roomId: pastRoom.id, cleaningTypeId: departureType.id,
          planDate: new Date(new Date().toISOString().slice(0, 10)),
          statusLog: { create: { from: 'NEW', to: 'NEW', note: 'демо-сид' } },
        },
      });
      await prisma.room.update({ where: { id: pastRoom.id }, data: { housekeepingStatus: 'DIRTY' } });
    }
  }
  const engRoom = roomByNumber('202');
  if (engRoom) {
    const mt = await prisma.opsTask.findFirst({ where: { roomId: engRoom.id, kind: 'TASK' } });
    if (!mt) {
      await prisma.opsTask.create({
        data: {
          tenantId: tenant.id, kind: 'TASK', status: 'DONE', title: 'Течёт смеситель в ванной',
          propertyId: property.id, roomId: engRoom.id, severity: 'MINOR', completedAt: new Date(),
          statusLog: { create: { from: 'NEW', to: 'DONE', note: 'демо-сид' } },
        },
      });
    }
  }
  console.log('Демо-задачи готовы: уборка (№201) + закрытая инженерная задача (№202)');

  // 12. Расширенный справочник оснащения (эталон TravelLine). Идемпотентно (skipDuplicates по code).
  const seen = new Set<string>();
  const amenityRows: { code: string; label: string; category: string; sortOrder: number }[] = [];
  let order = 1000;
  for (const g of AMENITY_CATALOG) {
    for (const label of g.items) {
      let code = amenityCode(label);
      while (seen.has(code)) code += 'x';
      seen.add(code);
      amenityRows.push({ code, label, category: g.category, sortOrder: order++ });
    }
  }
  await prisma.amenity.createMany({ data: amenityRows, skipDuplicates: true });
  console.log(`Справочник оснащения (TravelLine) готов: ${amenityRows.length} позиций`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
