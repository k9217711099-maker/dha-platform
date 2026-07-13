import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { MarketingOptionKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TenantService } from '../tenant/tenant.service.js';

/** Значения по умолчанию (эталон Bnovo). Сидируются, если у арендатора словари пусты. */
const DEFAULTS: Record<MarketingOptionKind, string[]> = {
  BOOKING_METHOD: ['Телефонный звонок', 'Сайт / модуль бронирования', 'Мессенджер', 'Электронная почта', 'Лично на стойке', 'OTA', 'Instagram (бронь с сайта)', 'VK (бронь с сайта)'],
  REFERRAL_SOURCE: ['Instagram', 'Рекомендация', 'VK', 'Telegram', 'Русские сезоны', 'Интернет', 'Яндекс поиск', 'Google поиск', 'Карты Яндекс', '2gis', 'Нашли на OTA', 'Постоянный гость / повторное бронирование', 'Другое'],
  DISCOUNT_REASON: ['Решение руководства', 'На усмотрение администратора', 'Возвращающийся гость (10%)', 'День рождения (10%)', 'Горящее предложение (8%)', 'Долгосрочное проживание (15%)', 'Сезонная скидка', 'Без скидки', 'Другое'],
  DISCOUNT_CAUSE: ['Постоянный гость 1 уровень', 'Постоянный гость 2 уровень'],
  CANCEL_REASON: ['Форс-мажор', 'Другой отель', 'Отсутствует оплата', 'Не оплатили, не отвечают', 'Другое'],
};

/** Маркетинговые словари («Настройки гостиниц → Маркетинг»). */
@Injectable()
export class MarketingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenantId = await this.tenant.getDefaultTenantId();
    const count = await this.prisma.marketingOption.count({ where: { tenantId } });
    if (count > 0) return; // не перетираем правки владельца
    const data: Prisma.MarketingOptionCreateManyInput[] = [];
    for (const kind of Object.keys(DEFAULTS) as MarketingOptionKind[]) {
      DEFAULTS[kind].forEach((label, i) => data.push({ tenantId, kind, label, sortOrder: i }));
    }
    await this.prisma.marketingOption.createMany({ data });
  }

  list(tenantId: string, kind?: MarketingOptionKind) {
    return this.prisma.marketingOption.findMany({
      where: { tenantId, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(tenantId: string, dto: { kind: MarketingOptionKind; label: string }) {
    const max = await this.prisma.marketingOption.aggregate({ where: { tenantId, kind: dto.kind }, _max: { sortOrder: true } });
    return this.prisma.marketingOption.create({
      data: { tenantId, kind: dto.kind, label: dto.label, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
  }

  async update(tenantId: string, id: string, dto: { label?: string; active?: boolean; sortOrder?: number }) {
    const found = await this.prisma.marketingOption.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Пункт словаря не найден');
    return this.prisma.marketingOption.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const found = await this.prisma.marketingOption.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Пункт словаря не найден');
    await this.prisma.marketingOption.delete({ where: { id } });
    return { ok: true };
  }
}
