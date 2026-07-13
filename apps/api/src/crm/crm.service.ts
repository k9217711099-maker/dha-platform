import { Injectable, Logger } from '@nestjs/common';
import { LoyaltyTier } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Bitrix24Port } from '../integrations/bitrix24/bitrix24.port.js';

/**
 * Синхронизация с Bitrix24 и автоматизации (§15). Все методы не должны ломать
 * основной поток — ошибки CRM логируются, но не пробрасываются.
 */
@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: Bitrix24Port,
  ) {}

  /** При бронировании: контакт + сделка в Bitrix24, уведомление о VIP-госте (§15.3). */
  async syncBooking(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { guest: true, property: true },
      });
      if (!booking) return;

      // Контакт (создаём один раз на гостя)
      let contactId = booking.guest.bitrixContactId;
      if (!contactId) {
        const res = await this.bitrix.upsertContact({
          guestId: booking.guestId,
          firstName: booking.guest.firstName,
          lastName: booking.guest.lastName,
          phone: booking.guest.phone,
          email: booking.guest.email,
        });
        contactId = res.contactId;
        await this.prisma.guest.update({
          where: { id: booking.guestId },
          data: { bitrixContactId: contactId },
        });
      }

      // Сделка
      const deal = await this.bitrix.createDeal({
        contactId,
        title: `Бронь ${booking.property.name} (${booking.checkIn.toISOString().slice(0, 10)})`,
        amountRub: booking.totalPrice,
        bookingRef: booking.id,
      });
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { bitrixDealId: deal.dealId },
      });

      // VIP-гость
      if (booking.guest.loyaltyTier === LoyaltyTier.GOLD || booking.guest.loyaltyTier === LoyaltyTier.PLATINUM) {
        await this.bitrix.addTimelineComment(
          { dealId: deal.dealId },
          `VIP-гость (уровень ${booking.guest.loyaltyTier}) — обеспечить повышенный сервис.`,
        );
      }
    } catch (err) {
      this.logger.warn(`CRM-синхронизация брони ${bookingId} не удалась: ${String(err)}`);
    }
  }

  /** Уведомить о проблеме с цифровым ключом (§15.3). */
  async notifyKeyProblem(bookingId: string, detail: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
      await this.bitrix.createTask({
        title: `Проблема с цифровым ключом (бронь ${bookingId.slice(0, 8)})`,
        description: detail + (booking?.bitrixDealId ? ` · сделка ${booking.bitrixDealId}` : ''),
      });
    } catch (err) {
      this.logger.warn(`Не удалось уведомить о проблеме ключа: ${String(err)}`);
    }
  }

  /** Напоминания об отзыве по завершённым проживаниям (§15.3). */
  async sendReviewReminders(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: { status: 'CHECKED_OUT', reviewReminderSent: false, checkOut: { lt: now } },
      include: { property: true },
    });
    for (const b of due) {
      try {
        await this.bitrix.createTask({
          title: `Напомнить гостю об отзыве (${b.property.name})`,
          description: `Бронь ${b.id}`,
        });
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { reviewReminderSent: true },
        });
      } catch (err) {
        this.logger.warn(`Напоминание об отзыве ${b.id} не отправлено: ${String(err)}`);
      }
    }
    return due.length;
  }
}
