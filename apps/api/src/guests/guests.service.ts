import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { UpdateProfileDto } from './dto/guest.dto.js';

/** Профиль гостя без чувствительных полей (паспорт/хэш пароля не отдаём). */
export interface GuestProfile {
  id: string;
  phone: string | null;
  email: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: Date | null;
  citizenship: string | null;
  loyaltyTier: string;
  hasPassport: boolean;
  consents: Record<ConsentType, boolean>;
}

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(guestId: string): Promise<GuestProfile> {
    const guest = await this.prisma.guest.findUnique({
      where: { id: guestId },
      include: { consents: { orderBy: { grantedAt: 'desc' } } },
    });
    if (!guest) throw new NotFoundException('Гость не найден');

    // Последнее по времени согласие каждого типа
    const consents = { PERSONAL_DATA: false, MARKETING: false, HOUSE_RULES: false };
    const seen = new Set<ConsentType>();
    for (const c of guest.consents) {
      if (!seen.has(c.type)) {
        consents[c.type] = c.granted;
        seen.add(c.type);
      }
    }

    return {
      id: guest.id,
      phone: guest.phone,
      email: guest.email,
      phoneVerified: guest.phoneVerified,
      emailVerified: guest.emailVerified,
      firstName: guest.firstName,
      lastName: guest.lastName,
      middleName: guest.middleName,
      birthDate: guest.birthDate,
      citizenship: guest.citizenship,
      loyaltyTier: guest.loyaltyTier,
      hasPassport: guest.passportEncrypted !== null,
      consents,
    };
  }

  async updateProfile(guestId: string, dto: UpdateProfileDto): Promise<GuestProfile> {
    await this.prisma.guest.update({
      where: { id: guestId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        citizenship: dto.citizenship,
      },
    });
    return this.getProfile(guestId);
  }

  /** Обновить согласие на маркетинг — добавляет запись в журнал согласий (152-ФЗ). */
  async updateMarketingConsent(guestId: string, granted: boolean): Promise<GuestProfile> {
    await this.prisma.guestConsent.create({
      data: { guestId, type: ConsentType.MARKETING, granted },
    });
    return this.getProfile(guestId);
  }
}
