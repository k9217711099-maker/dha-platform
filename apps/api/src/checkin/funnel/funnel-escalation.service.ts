import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * Эскалации воронки заселения в задачи (CHECK-IN-TZ §6.5) — собственный модуль
 * ops/* вместо Bitrix24. Создаёт OpsTask администратору с контекстом брони.
 * Идемпотентность — через dedupeKey в FunnelEventLog (уникальный индекс).
 */
@Injectable()
export class FunnelEscalationService {
  private readonly logger = new Logger(FunnelEscalationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создать эскалацию один раз на dedupeKey. Возвращает true, если задача создана
   * (false — уже была или бронь не найдена). Не бросает.
   */
  async escalateOnce(params: {
    bookingId: string;
    dedupeKey: string;
    kind: string;
    title: string;
    description: string;
  }): Promise<boolean> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: params.bookingId },
        select: { tenantId: true, propertyId: true, roomId: true, bookingNumber: true },
      });
      if (!booking) return false;

      // Дедуп: уникальный dedupeKey; повторный тик упадёт на unique и выйдет.
      await this.prisma.funnelEventLog.create({
        data: {
          tenantId: booking.tenantId,
          bookingId: params.bookingId,
          kind: params.kind,
          dedupeKey: params.dedupeKey,
          detail: params.title,
        },
      });

      await this.prisma.opsTask.create({
        data: {
          tenantId: booking.tenantId,
          kind: 'TASK',
          status: 'NEW',
          title: params.title,
          description: `${params.description}\nБронь № ${booking.bookingNumber ?? params.bookingId.slice(0, 8)}.`,
          propertyId: booking.propertyId,
          roomId: booking.roomId,
          bookingId: params.bookingId,
          important: true,
          statusLog: { create: { from: 'NEW', to: 'NEW', note: 'создана воронкой заселения' } },
        },
      });
      this.logger.log(`Эскалация «${params.title}» по брони ${params.bookingId}`);
      return true;
    } catch (err) {
      // Unique violation по dedupeKey — штатный путь (уже эскалировано).
      if ((err as { code?: string }).code !== 'P2002') {
        this.logger.warn(`Эскалация не создана (${params.dedupeKey}): ${String(err)}`);
      }
      return false;
    }
  }
}
