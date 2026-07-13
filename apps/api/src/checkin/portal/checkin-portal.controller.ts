import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { KeysService } from '../../keys/keys.service.js';
import { PaymentsService } from '../../payments/payments.service.js';
import { PmsBookingService } from '../../pms/bookings/pms-booking.service.js';
import { CheckinService } from '../checkin.service.js';
import { CheckinFunnelService } from '../funnel/checkin-funnel.service.js';
import { GuestCheckinLinkService } from './guest-checkin-link.service.js';
// Важно: value-импорт (не `import type`) — иначе ValidationPipe не увидит класс DTO.
import { SaveCheckinDto } from '../dto/save-checkin.dto.js';

/**
 * Гостевой портал заселения (CHECK-IN-TZ §4/§10) — доступ по magic-link токену,
 * БЕЗ авторизации. Токен = ограниченная сессия на одну бронь: контекст воронки,
 * онлайн-регистрация, оплата, цифровой ключ. Делегирует существующим сервисам
 * (checkin/keys/payments) от имени гостя брони — отдельного пути нет.
 */
@ApiTags('checkin-portal')
@Controller('s/checkin')
export class CheckinPortalController {
  constructor(
    private readonly links: GuestCheckinLinkService,
    private readonly prisma: PrismaService,
    private readonly checkin: CheckinService,
    private readonly keys: KeysService,
    private readonly funnel: CheckinFunnelService,
    private readonly payments: PaymentsService,
    private readonly bookings: PmsBookingService,
  ) {}

  /** Контекст портала: бронь + стадия/шлюзы + этапы воронки с текстами для гостя. */
  @Get(':token')
  async context(@Param('token') token: string) {
    const { booking, tenantId } = await this.resolve(token, true);
    const [panel, checkinView, payInfo] = await Promise.all([
      this.funnel.panelForBooking(tenantId, booking.id),
      this.checkin.getOrStart(booking.guestId, booking.id),
      this.bookings.paymentInfo(tenantId, booking.id).catch(() => null),
    ]);

    // Этапы активной воронки: тексты «как это работает» для гостя (§2.1).
    const funnel =
      (await this.prisma.checkinFunnel.findFirst({
        where: { tenantId, active: true, propertyId: booking.propertyId },
        include: { stages: { orderBy: { order: 'asc' } } },
      })) ??
      (await this.prisma.checkinFunnel.findFirst({
        where: { tenantId, active: true, isDefault: true },
        include: { stages: { orderBy: { order: 'asc' } } },
      }));

    // Инструкция по заселению (каскад, CHECK-IN-TZ): в режиме апартаментов
    // (perRoomInstructions) своя инструкция номера приоритетнее общей объектной.
    // Показываем только после регистрации/оплаты/назначения номера — в инструкции
    // могут быть коды домофона. Временно́е окно НЕ требуем: гость едет к объекту
    // до открытия окна ключа (окно скрывает только PIN).
    const gatesPassed = panel.gates.every((g) => g.ok || g.key === 'time_window_open');
    const instructions = gatesPassed
      ? (booking.property.perRoomInstructions ? (booking.room?.checkinInstructions ?? booking.property.instructions) : booking.property.instructions) ?? null
      : null;
    const unitAddress = gatesPassed ? (booking.room?.address ?? null) : null;
    // Фото-инструкция номера (режим апартаментов) — только после шлюзов и только в этом режиме.
    const instructionPhotos = gatesPassed && booking.property.perRoomInstructions ? (booking.room?.checkinPhotos ?? []) : [];

    return {
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guests: booking.guests,
        totalPrice: booking.totalPrice,
        paymentStatus: booking.paymentStatus,
        property: {
          name: booking.property.name,
          address: booking.property.address,
          checkInTime: booking.property.checkInTime,
          checkOutTime: booking.property.checkOutTime,
        },
        roomTypeName: booking.roomType?.name ?? null,
        guestName: [booking.guest?.firstName, booking.guest?.lastName].filter(Boolean).join(' ') || null,
      },
      instructions,
      unitAddress,
      instructionPhotos,
      stage: panel.stage,
      gates: panel.gates,
      window: panel.window,
      checkin: checkinView,
      payment: payInfo ? { remaining: payInfo.remaining, prepayment: payInfo.prepayment } : null,
      stages: (funnel?.stages ?? [])
        .filter((s) => s.enabled)
        .map((s) => ({ key: s.key, title: s.title, order: s.order, guestDescription: s.guestDescription })),
    };
  }

  /** Сохранить анкету регистрации (черновик). */
  @Put(':token/registration')
  async saveRegistration(@Param('token') token: string, @Body() dto: SaveCheckinDto) {
    const { booking } = await this.resolve(token);
    return this.checkin.saveDraft(booking.guestId, booking.id, dto);
  }

  /** Отправить регистрацию на проверку. */
  @Post(':token/registration/submit')
  async submitRegistration(@Param('token') token: string) {
    const { booking } = await this.resolve(token);
    return this.checkin.submit(booking.guestId, booking.id);
  }

  /** Загрузить скан паспорта (шифруется, как в ЛК). */
  @Post(':token/passport')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadPassport(
    @Param('token') token: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string },
  ) {
    const { booking } = await this.resolve(token);
    return this.checkin.uploadPassport(booking.guestId, booking.id, file);
  }

  /** Ссылка на оплату остатка (эквайринг — как в ЛК/админке). */
  @Post(':token/pay')
  async pay(@Param('token') token: string) {
    const { booking, tenantId } = await this.resolve(token);
    const info = await this.bookings.paymentInfo(tenantId, booking.id);
    if (!info.remaining || info.remaining <= 0) return { error: 'Оплата не требуется' };
    return this.payments.createForBookingByAdmin(booking.id, { amount: info.remaining });
  }

  /** Состояние ключей (двери, PIN в окне действия, причины отказа). */
  @Get(':token/key')
  async key(@Param('token') token: string) {
    const { booking } = await this.resolve(token);
    return this.keys.getForBooking(booking.guestId, booking.id);
  }

  /** Выдать ключи (те же правила, что в ЛК). */
  @Post(':token/key')
  async issueKey(@Param('token') token: string) {
    const { booking } = await this.resolve(token);
    return this.keys.issue(booking.guestId, booking.id);
  }

  /** Удалённо открыть дверь через шлюз. */
  @Post(':token/key/open')
  async openDoor(@Param('token') token: string, @Body() body: { lockId?: string }) {
    const { booking } = await this.resolve(token);
    if (!body.lockId) throw new NotFoundException('Не указана дверь');
    return this.keys.openDoor(booking.guestId, booking.id, body.lockId);
  }

  private async resolve(token: string, countOpen = false) {
    const link = await this.links.resolve(token, countOpen);
    if (!link) throw new NotFoundException('Ссылка недействительна или истекла');
    const booking = await this.prisma.booking.findUnique({
      where: { id: link.bookingId },
      include: {
        property: {
          select: { name: true, address: true, checkInTime: true, checkOutTime: true, instructions: true, perRoomInstructions: true },
        },
        room: { select: { address: true, checkinInstructions: true, checkinPhotos: true } },
        roomType: { select: { name: true } },
        guest: { select: { firstName: true, lastName: true } },
      },
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    return { booking, tenantId: link.tenantId };
  }
}
