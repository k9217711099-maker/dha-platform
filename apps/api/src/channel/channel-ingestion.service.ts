import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BookingChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { PmsBookingService } from '../pms/bookings/pms-booking.service.js';
import { ChannelAdapterRegistry } from './adapters/channel-adapter.registry.js';
import { ChannelSyncService } from './channel-sync.service.js';
import type { CreateBookingDto } from '../pms/bookings/dto/booking.dto.js';

/**
 * Приём броней/отмен из каналов (DHP §24). Брони создаются ТОЛЬКО через PmsBookingService —
 * проходят анти-овербукинг (не в обход правил). Дубли — по (channelId, externalBookingId).
 * Нет доступности → бронь не создаётся, фиксируется CONFLICT (ручной разбор).
 */
@Injectable()
export class ChannelIngestionService {
  private readonly logger = new Logger(ChannelIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ChannelAdapterRegistry,
    private readonly pmsBooking: PmsBookingService,
    private readonly sync: ChannelSyncService,
  ) {}

  async ingestBooking(channelId: string, raw: unknown, token?: string) {
    const channel = await this.getActiveChannel(channelId);
    this.assertToken(channel, token);
    const norm = this.registry.resolve(channel).parseBooking(raw);
    const tenantId = channel.tenantId;

    // Дедуп: повторный payload не создаёт дубль (DHP §10).
    const dup = await this.prisma.channelBooking.findUnique({
      where: { channelId_externalBookingId: { channelId, externalBookingId: norm.externalBookingId } },
    });
    if (dup) return { duplicate: true, channelBooking: dup };

    // Обратный маппинг remote → наши id. Категория (item/room-type) обязательна.
    const rtMap = await this.prisma.channelRoomTypeMapping.findUnique({
      where: { channelId_remoteRoomTypeId: { channelId, remoteRoomTypeId: norm.remoteRoomTypeId } },
    });
    if (!rtMap) throw new BadRequestException({ code: 'mapping_not_found', message: 'Не найден маппинг категории для канала' });
    // Объект: из явного property-маппинга (если задан) либо от самой категории (каналы уровня
    // объявления, напр. Avito — квартира = категория, отдельного property-маппинга нет).
    const propertyId = await this.resolvePropertyId(channelId, tenantId, norm.remotePropertyId, rtMap.roomTypeId);

    const dto: CreateBookingDto = {
      propertyId,
      roomTypeId: rtMap.roomTypeId,
      checkIn: norm.arrivalDate,
      checkOut: norm.departureDate,
      guests: Math.max(norm.adults + norm.children, 1),
      totalPrice: norm.totalAmount,
      source: BookingChannel.OTA,
      ratePlanName: `OTA · ${channel.code}`,
      firstName: norm.guest.firstName,
      lastName: norm.guest.lastName,
      phone: norm.guest.phone,
      email: norm.guest.email,
    };

    try {
      // Идемпотентность создания брони по каналу+внешнему id (защита от гонок/дублей).
      // create возвращает view брони (или сохранённый JSON при повторе ключа) — оба несут id.
      const booking = (await this.pmsBooking.create(tenantId, dto, undefined, `ota:${channelId}:${norm.externalBookingId}`)) as { id: string };
      if (norm.paymentCollectMode === 'channel') {
        await this.prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PAID' } });
      }
      const channelBooking = await this.prisma.channelBooking.create({
        data: { tenantId, channelId, externalBookingId: norm.externalBookingId, bookingId: booking.id, status: 'INGESTED', raw: raw as Prisma.InputJsonValue },
      });
      await this.prisma.channel.update({ where: { id: channelId }, data: { lastBookingAt: new Date() } });
      // Инвентарь изменился → синк доступности в остальные каналы (сбой не критичен).
      await this.sync.enqueueForProperty(tenantId, propertyId, 'AVAILABILITY', channelId);
      return { channelBooking, booking };
    } catch (e) {
      if (e instanceof ConflictException) {
        // Нет доступности: бронь не создаём, фиксируем конфликт для ручного разбора (DHP §6).
        const channelBooking = await this.prisma.channelBooking.create({
          data: { tenantId, channelId, externalBookingId: norm.externalBookingId, bookingId: null, status: 'CONFLICT', raw: raw as Prisma.InputJsonValue },
        });
        this.logger.warn(`OTA-бронь ${norm.externalBookingId} (${channel.code}): конфликт доступности`);
        return { conflict: true, channelBooking };
      }
      throw e;
    }
  }

  async ingestCancellation(channelId: string, raw: unknown, token?: string) {
    const channel = await this.getActiveChannel(channelId);
    this.assertToken(channel, token);
    const norm = this.registry.resolve(channel).parseCancellation(raw);

    const cb = await this.prisma.channelBooking.findUnique({
      where: { channelId_externalBookingId: { channelId, externalBookingId: norm.externalBookingId } },
    });
    if (!cb) throw new NotFoundException('Бронь канала не найдена');
    if (cb.status === 'CANCELLED') return cb; // идемпотентно
    if (!cb.bookingId) {
      return this.prisma.channelBooking.update({ where: { id: cb.id }, data: { status: 'CANCELLED' } });
    }

    const booking = await this.pmsBooking.cancel(channel.tenantId, cb.bookingId, { reason: `Отмена из канала ${channel.code}` });
    const updated = await this.prisma.channelBooking.update({ where: { id: cb.id }, data: { status: 'CANCELLED' } });
    await this.sync.enqueueForProperty(channel.tenantId, booking.propertyId, 'AVAILABILITY', channelId);
    return updated;
  }

  /**
   * Объект брони: сперва явный property-маппинг по remotePropertyId (multi-property каналы),
   * иначе — объект самой категории (каналы уровня объявления). roomType→property авторитетна,
   * и PmsBookingService всё равно валидирует принадлежность категории объекту.
   */
  private async resolvePropertyId(channelId: string, tenantId: string, remotePropertyId: string, roomTypeId: string): Promise<string> {
    if (remotePropertyId) {
      const propMap = await this.prisma.channelPropertyMapping.findUnique({
        where: { channelId_remotePropertyId: { channelId, remotePropertyId } },
      });
      if (propMap) return propMap.propertyId;
    }
    const roomType = await this.prisma.roomType.findFirst({ where: { id: roomTypeId, tenantId }, select: { propertyId: true } });
    if (!roomType) throw new BadRequestException({ code: 'mapping_not_found', message: 'Категория маппинга не найдена в каталоге' });
    return roomType.propertyId;
  }

  private async getActiveChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || !channel.active) throw new NotFoundException({ code: 'unknown_channel', message: 'Канал не найден или отключён' });
    return channel;
  }

  private assertToken(channel: { credentials: Prisma.JsonValue }, token?: string) {
    const expected = (channel.credentials as { token?: string } | null)?.token;
    if (expected && expected !== token) throw new ForbiddenException({ code: 'invalid_signature', message: 'Неверный токен канала' });
  }
}
