import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WhAddressType, WhNormUnit } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';

interface SeedAddress {
  name: string;
  type: WhAddressType;
  fullAddress: string;
  roomsCount: number;
}
interface SeedItem {
  name: string;
  cat: string;
  unit: string;
  minStock?: number;
  parStock?: number;
  trackExpiry?: boolean;
  price?: number;
}

const CATEGORIES = [
  'Косметика для гостей',
  'Бытовая химия',
  'Расходники housekeeping',
  'Бельё',
  'Полотенца',
  'Тапочки',
  'Посуда',
  'Минибар',
  'Продукты',
  'Инженерные запчасти',
  'Карт-ключи и ресепшен',
  'Канцелярия',
  'Прочее',
];

const ADDRESSES: SeedAddress[] = [
  { name: 'Апартаменты Невский 74', type: 'APARTMENTS', fullAddress: 'Невский пр., 74', roomsCount: 8 },
  { name: 'Апартаменты Рубинштейна', type: 'APARTMENTS', fullAddress: 'ул. Рубинштейна, 15', roomsCount: 6 },
  { name: 'Мини-отель на Лиговском', type: 'MINI_HOTEL', fullAddress: 'Лиговский пр., 50', roomsCount: 14 },
  { name: 'Апартаменты Галерная', type: 'APARTMENTS', fullAddress: 'ул. Галерная, 20', roomsCount: 5 },
];

const ITEMS: SeedItem[] = [
  { name: 'Шампунь 30 мл', cat: 'Косметика для гостей', unit: 'шт', minStock: 50, parStock: 200, trackExpiry: true, price: 18 },
  { name: 'Гель для душа 30 мл', cat: 'Косметика для гостей', unit: 'шт', minStock: 50, parStock: 200, trackExpiry: true, price: 18 },
  { name: 'Туалетная бумага', cat: 'Расходники housekeeping', unit: 'рул', minStock: 80, parStock: 300, price: 22 },
  { name: 'Тапочки одноразовые', cat: 'Тапочки', unit: 'пара', minStock: 40, parStock: 150, price: 35 },
  { name: 'Вода 0,5 л', cat: 'Минибар', unit: 'шт', minStock: 60, parStock: 240, trackExpiry: true, price: 20 },
  { name: 'Комплект постельного белья', cat: 'Бельё', unit: 'компл', minStock: 20, parStock: 60, price: 1200 },
  { name: 'Полотенце банное', cat: 'Полотенца', unit: 'шт', minStock: 30, parStock: 90, price: 450 },
  { name: 'Полотенце лицевое', cat: 'Полотенца', unit: 'шт', minStock: 30, parStock: 90, price: 250 },
  { name: 'Средство для уборки ванной', cat: 'Бытовая химия', unit: 'шт', minStock: 10, parStock: 30, trackExpiry: true, price: 180 },
  { name: 'Лампа LED', cat: 'Инженерные запчасти', unit: 'шт', minStock: 10, parStock: 40, price: 120 },
  { name: 'Батарейка AA', cat: 'Инженерные запчасти', unit: 'шт', minStock: 20, parStock: 80, price: 35 },
  { name: 'Карта-ключ', cat: 'Карт-ключи и ресепшен', unit: 'шт', minStock: 30, parStock: 100, price: 60 },
  { name: 'Мешки для мусора', cat: 'Расходники housekeeping', unit: 'упак', minStock: 15, parStock: 50, price: 90 },
  { name: 'Губка', cat: 'Расходники housekeeping', unit: 'шт', minStock: 30, parStock: 100, price: 12 },
  { name: 'Чай чёрный пакетированный', cat: 'Минибар', unit: 'упак', minStock: 20, parStock: 80, trackExpiry: true, price: 110 },
];

/** Демо складские данные (§21). Создаются один раз при пустой БД (как ExtrasService). */
@Injectable()
export class WarehouseSeedService implements OnModuleInit {
  private readonly logger = new Logger(WarehouseSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((await this.prisma.whAddress.count()) === 0) await this.seedCore();
    await this.seedNorms();
  }

  private async seedCore(): Promise<void> {
    // Склады без адреса (центральный + служебные)
    await this.prisma.whWarehouse.createMany({
      data: [
        { name: 'Центральный склад', type: 'CENTRAL' },
        { name: 'Склад брака', type: 'DEFECT' },
        { name: 'Склад списания', type: 'WRITE_OFF' },
      ],
    });

    // Адреса + их локальные склады
    const addressIds: string[] = [];
    for (const a of ADDRESSES) {
      const addr = await this.prisma.whAddress.create({ data: a });
      addressIds.push(addr.id);
      await this.prisma.whWarehouse.create({
        data: { name: `Склад · ${addr.name}`, type: 'ADDRESS_LOCAL', addressId: addr.id },
      });
    }

    // Демо-пользователи склада (§3, §21). Сотрудники адреса — со скоупом по allowedAddressIds.
    const users: { email: string; password: string; name: string; roleKey: string; allowedAddressIds: string[] }[] = [
      { email: 'sklad@dha.local', password: 'sklad12345', name: 'Кладовщик ЦС', roleKey: 'wh_keeper', allowedAddressIds: [] },
      { email: 'whhead@dha.local', password: 'head12345', name: 'Руководитель УК', roleKey: 'wh_head', allowedAddressIds: [] },
      { email: 'finance@dha.local', password: 'fin12345', name: 'Бухгалтер', roleKey: 'wh_finance', allowedAddressIds: [] },
      { email: 'engineer@dha.local', password: 'eng12345', name: 'Главный инженер', roleKey: 'wh_engineer', allowedAddressIds: [] },
      { email: 'housekeeping@dha.local', password: 'hk12345', name: 'Супервайзер ХС', roleKey: 'wh_housekeeping', allowedAddressIds: addressIds.slice(0, 2) },
      { email: 'objmanager@dha.local', password: 'obj12345', name: 'Менеджер объекта', roleKey: 'wh_object_manager', allowedAddressIds: addressIds.slice(0, 1) },
    ];
    const tenantId = await this.tenant.getDefaultTenantId();
    for (const u of users) {
      await this.prisma.adminUser.upsert({
        where: { email: u.email },
        update: { roleKey: u.roleKey, allowedAddressIds: u.allowedAddressIds },
        create: {
          tenantId,
          email: u.email,
          passwordHash: await bcrypt.hash(u.password, 10),
          name: u.name,
          role: 'MANAGER',
          roleKey: u.roleKey,
          allowedAddressIds: u.allowedAddressIds,
        },
      });
    }

    // Категории
    await this.prisma.whCategory.createMany({
      data: CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
    });
    const cats = await this.prisma.whCategory.findMany();
    const fallbackCatId = cats[0]?.id ?? '';
    const catId = (n: string): string => cats.find((c) => c.name === n)?.id ?? fallbackCatId;

    // Номенклатура
    await this.prisma.whItem.createMany({
      data: ITEMS.map((it) => ({
        name: it.name,
        categoryId: catId(it.cat),
        unit: it.unit,
        minStock: it.minStock ?? null,
        parStock: it.parStock ?? null,
        trackExpiry: it.trackExpiry ?? false,
        lastPurchasePrice: it.price ?? null,
        avgPrice: it.price ?? null,
      })),
    });

    this.logger.log(`Демо складские данные созданы: ${ADDRESSES.length} адресов, ${ITEMS.length} позиций`);
  }

  /** Демо-нормы расхода (§7). Идемпотентно по счётчику норм — заполнит и существующую БД. */
  private async seedNorms(): Promise<void> {
    if ((await this.prisma.whConsumptionNorm.count()) > 0) return;
    const created = await this.prisma.whItem.findMany();
    if (!created.length) return;
    const itemId = (n: string): string | undefined => created.find((i) => i.name.includes(n))?.id;
    const normSpecs: { name: string; unit: WhNormUnit; qty: number }[] = [
      { name: 'Шампунь', unit: 'ROOM_NIGHT', qty: 1 },
      { name: 'Гель для душа', unit: 'ROOM_NIGHT', qty: 1 },
      { name: 'Туалетная бумага', unit: 'ROOM_NIGHT', qty: 0.5 },
      { name: 'Тапочки', unit: 'STAY', qty: 1 },
      { name: 'Вода', unit: 'GUEST', qty: 1 },
    ];
    const normData = normSpecs
      .map((n) => ({ itemId: itemId(n.name), unit: n.unit, normQuantity: n.qty }))
      .filter((n): n is { itemId: string; unit: WhNormUnit; normQuantity: number } => Boolean(n.itemId));
    if (normData.length) await this.prisma.whConsumptionNorm.createMany({ data: normData });
    this.logger.log(`Демо-нормы расхода созданы: ${normData.length}`);
  }
}
