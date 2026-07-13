import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Promocode, PromocodeApplication, PromocodeType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';

export interface DiscountResult {
  finalRub: number;
  discountRub: number;
  promocode: Promocode | null;
}

/** Полный набор полей промокода (эталон Bnovo). code+value обязательны. */
export interface PromocodeInput {
  code: string;
  value: number;
  comment?: string;
  type?: PromocodeType;
  application?: PromocodeApplication;
  validFrom?: string;
  validUntil?: string;
  maxUses?: number;
  roomTypeIds?: string[];
  ratePlanIds?: string[];
  showOnlyMatchingCategories?: boolean;
  showOnlyMatchingTariffs?: boolean;
  source?: string;
  bookingMethod?: string;
  referralSource?: string;
  discountReason?: string;
  autoApplyOnEmail?: boolean;
  ignoreRestrictions?: boolean;
  upgradeFromRoomTypeId?: string;
  upgradeToRoomTypeId?: string;
  freeExtraId?: string;
  active?: boolean;
}

/** Промокоды (§17): валидация, расчёт скидки, учёт использований, CRUD. */
@Injectable()
export class PromocodeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Применить промокод к сумме. Без кода — без скидки. Невалидный код — ошибка. */
  async applyToBase(code: string | undefined, baseRub: number): Promise<DiscountResult> {
    if (!code) return { finalRub: baseRub, discountRub: 0, promocode: null };

    const promocode = await this.prisma.promocode.findUnique({ where: { code } });
    if (!promocode || !promocode.active) throw new BadRequestException('Промокод недействителен');
    if (promocode.validUntil && promocode.validUntil < new Date()) {
      throw new BadRequestException('Срок действия промокода истёк');
    }
    if (promocode.maxUses !== null && promocode.usedCount >= promocode.maxUses) {
      throw new BadRequestException('Промокод исчерпан');
    }

    const discountRub =
      promocode.type === PromocodeType.PERCENT
        ? Math.floor((baseRub * promocode.value) / 100)
        : Math.min(promocode.value, baseRub);

    return { finalRub: Math.max(baseRub - discountRub, 0), discountRub, promocode };
  }

  /** Зафиксировать использование промокода (после успешной брони). */
  async markUsed(promocodeId: string): Promise<void> {
    await this.prisma.promocode.update({
      where: { id: promocodeId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // --- Админ-CRUD ---

  list() {
    return this.prisma.promocode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(data: PromocodeInput) {
    return this.prisma.promocode.create({ data: { ...this.common(data), code: data.code.toUpperCase(), value: data.value } });
  }

  async update(id: string, data: PromocodeInput) {
    const existing = await this.prisma.promocode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Промокод не найден');
    return this.prisma.promocode.update({ where: { id }, data: { ...this.common(data), code: data.code.toUpperCase(), value: data.value } });
  }

  async remove(id: string) {
    const existing = await this.prisma.promocode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Промокод не найден');
    await this.prisma.promocode.delete({ where: { id } });
    return { ok: true };
  }

  async setActive(id: string, active: boolean) {
    const existing = await this.prisma.promocode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Промокод не найден');
    return this.prisma.promocode.update({ where: { id }, data: { active } });
  }

  /** Опциональные поля (кроме code/value) → Prisma. Плоские значения валидны для create и update. */
  private common(d: Partial<PromocodeInput>): Partial<Prisma.PromocodeUncheckedCreateInput> {
    const o: Partial<Prisma.PromocodeUncheckedCreateInput> = {};
    if (d.comment !== undefined) o.comment = d.comment;
    if (d.type !== undefined) o.type = d.type;
    if (d.application !== undefined) o.application = d.application;
    if (d.validFrom !== undefined) o.validFrom = d.validFrom ? new Date(d.validFrom) : null;
    if (d.validUntil !== undefined) o.validUntil = d.validUntil ? new Date(d.validUntil) : null;
    if (d.maxUses !== undefined) o.maxUses = d.maxUses ?? null;
    if (d.roomTypeIds !== undefined) o.roomTypeIds = d.roomTypeIds;
    if (d.ratePlanIds !== undefined) o.ratePlanIds = d.ratePlanIds;
    if (d.showOnlyMatchingCategories !== undefined) o.showOnlyMatchingCategories = d.showOnlyMatchingCategories;
    if (d.showOnlyMatchingTariffs !== undefined) o.showOnlyMatchingTariffs = d.showOnlyMatchingTariffs;
    if (d.source !== undefined) o.source = d.source;
    if (d.bookingMethod !== undefined) o.bookingMethod = d.bookingMethod;
    if (d.referralSource !== undefined) o.referralSource = d.referralSource;
    if (d.discountReason !== undefined) o.discountReason = d.discountReason;
    if (d.autoApplyOnEmail !== undefined) o.autoApplyOnEmail = d.autoApplyOnEmail;
    if (d.ignoreRestrictions !== undefined) o.ignoreRestrictions = d.ignoreRestrictions;
    if (d.upgradeFromRoomTypeId !== undefined) o.upgradeFromRoomTypeId = d.upgradeFromRoomTypeId || null;
    if (d.upgradeToRoomTypeId !== undefined) o.upgradeToRoomTypeId = d.upgradeToRoomTypeId || null;
    if (d.freeExtraId !== undefined) o.freeExtraId = d.freeExtraId || null;
    if (d.active !== undefined) o.active = d.active;
    return o;
  }
}
