import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  CheckinStatus,
  KeyStatus,
  KeyType,
  Lock,
  LockTarget,
  PaymentStatus,
} from '@prisma/client';
import {
  BookingStatus as DomainBookingStatus,
  CheckinStatus as DomainCheckinStatus,
  canIssueKey,
  computeKeyValidityWindow,
} from '@dha/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { TtlockPort } from '../integrations/ttlock/ttlock.port.js';
import { FunnelEscalationService } from '../checkin/funnel/funnel-escalation.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AvailabilityService } from '../pms/availability/availability.service.js';
import { combineDateAndTime } from './key-window.js';
import { lockCoversRoom, type CoverageRoom } from './lock-coverage.js';
import type { Env } from '../config/env.schema.js';

/** Ключ к одной двери. */
export interface KeyDoor {
  doorName: string;
  target: LockTarget;
  status: KeyStatus | 'NOT_ISSUED';
  /** PIN — только когда ключ активен и действует сейчас. */
  pin: string | null;
  /** ID замка TTLock — для удалённого открытия. */
  ttlockLockId: string;
  /** Доступно ли удалённое открытие через шлюз (из веба/приложения). */
  canRemoteOpen: boolean;
}

/** Набор ключей брони (личная дверь номера + общие двери). */
export interface KeysView {
  eligible: boolean;
  reasons: string[];
  validFrom: Date | null;
  validUntil: Date | null;
  doors: KeyDoor[];
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ttlock: TtlockPort,
    private readonly crypto: CryptoService,
    private readonly escalation: FunnelEscalationService,
    private readonly notifications: NotificationsService,
    private readonly availability: AvailabilityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Состояние ключей по брони (все двери номера) + возможность выдачи. */
  async getForBooking(guestId: string, bookingId: string): Promise<KeysView> {
    let { booking, window, gates } = await this.loadContext(guestId, bookingId);
    const decision = this.decide(booking, window, gates);
    // Гость прошёл все условия, но конкретный номер ещё не выбран — назначаем готовый.
    if (!booking.room && decision.allowed) {
      const assigned = await this.availability.autoAssignReadyRoom(bookingId);
      if (assigned) ({ booking, window, gates } = await this.loadContext(guestId, bookingId));
    }
    const locks = await this.locksForBooking(booking);
    const reasons = booking.room
      ? decision.reasons
      : [...decision.reasons, 'Свободный готовый номер пока не найден — ожидайте назначения'];
    return this.buildView(bookingId, locks, window, decision.allowed && !!booking.room, reasons);
  }

  /** Выдать ключи ко всем дверям номера (личная + общие), §9.3. */
  async issue(guestId: string, bookingId: string): Promise<KeysView> {
    let { booking, window, gates } = await this.loadContext(guestId, bookingId);
    const decision = this.decide(booking, window, gates);
    if (!booking.room && decision.allowed) {
      // Автоматически назначаем готовый (чистый) свободный номер категории.
      const assigned = await this.availability.autoAssignReadyRoom(bookingId);
      if (!assigned) {
        throw new BadRequestException(
          'Ключ недоступен: свободный готовый номер не найден — дождитесь назначения номера администратором',
        );
      }
      ({ booking, window, gates } = await this.loadContext(guestId, bookingId));
    }
    if (!decision.allowed) {
      throw new BadRequestException(`Ключ недоступен: ${decision.reasons.join('; ')}`);
    }
    if (!booking.room) {
      throw new BadRequestException('Ключ недоступен: конкретный номер ещё не назначен');
    }

    const locks = await this.locksForBooking(booking);
    if (locks.length === 0) {
      throw new BadRequestException('Для этого номера не настроены замки');
    }

    // Единый случайный PIN на все двери номера (§9.3): гость запоминает один код —
    // он записывается на дверь номера и общие привязанные двери. Свой (custom) код
    // можно установить только через шлюз, поэтому объединяем лишь двери со шлюзом;
    // если у двери шлюза нет или запись не удалась после нескольких попыток — временный
    // код по алгоритму TTLock (см. issueOne). Один код на бронь, ротация в один вызов.
    const sharedPin = this.randomPin(this.config.get('TTLOCK_UNIFIED_PIN_LENGTH', { infer: true }));

    const guestName = await this.guestNameFor(guestId);
    let success = 0;
    let failed = 0;
    for (const lock of locks) {
      const existing = await this.prisma.digitalKey.findFirst({
        where: { bookingId, lockId: lock.ttlockLockId, status: KeyStatus.ACTIVE },
      });
      if (existing) {
        success += 1;
        continue;
      }
      const ok = await this.issueOne(guestId, bookingId, lock, window, sharedPin, guestName);
      if (ok) success += 1;
      else failed += 1;
    }

    if (success === 0 && failed > 0) {
      throw new BadRequestException('Не удалось создать ключи. Попробуйте позже.');
    }
    if (success > 0) {
      // Каскад инструкции (CHECK-IN-TZ, режим апартаментов): номер → объект.
      const instructions =
        (booking.property.perRoomInstructions
          ? booking.room?.checkinInstructions ?? booking.property.instructions
          : booking.property.instructions) ?? '';
      await this.notifications.notify(guestId, 'KEY_READY', {
        property: booking.property.name,
        address: booking.room?.address ?? '',
        instructions,
      });
    }
    return this.buildView(bookingId, locks, window, true, []);
  }

  /**
   * Удалённо открыть дверь через шлюз (работает из веба и приложения, §9.5).
   * Те же правила доступа, что и для выдачи ключа; замок должен иметь шлюз.
   */
  async openDoor(guestId: string, bookingId: string, ttlockLockId: string): Promise<{ ok: true }> {
    const { booking, window, gates } = await this.loadContext(guestId, bookingId);
    const decision = this.decide(booking, window, gates);
    if (!decision.allowed) {
      throw new BadRequestException(`Открытие недоступно: ${decision.reasons.join('; ')}`);
    }

    if (!booking.room) throw new BadRequestException('Открытие недоступно: номер не назначен');
    const locks = await this.locksForBooking(booking);
    const lock = locks.find((l) => l.ttlockLockId === ttlockLockId && l.active);
    if (!lock) throw new NotFoundException('Дверь не привязана к этому номеру');
    if (!lock.hasGateway) {
      throw new BadRequestException('Удалённое открытие недоступно — у двери нет шлюза');
    }

    await this.ttlock.unlock(ttlockLockId);
    this.logger.log(`Удалённое открытие "${lock.name}" по брони ${bookingId} (гость ${guestId})`);
    return { ok: true };
  }

  /** Админ: выдать ключи для брони. */
  async adminIssue(bookingId: string): Promise<KeysView> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    return this.issue(booking.guestId, bookingId);
  }

  /** Админ: текущее состояние ключей брони (для «пульта от замка» в карточке, #2). */
  async adminGet(bookingId: string): Promise<KeysView> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
    return this.getForBooking(booking.guestId, bookingId);
  }

  /** Отозвать все активные ключи брони (удаляем коды, §9.4). */
  async revoke(bookingId: string, actor = 'system'): Promise<void> {
    const keys = await this.prisma.digitalKey.findMany({
      where: { bookingId, status: KeyStatus.ACTIVE },
    });
    for (const key of keys) {
      if (key.ttlockKeyId) {
        await this.ttlock.deletePasscode(key.lockId, key.ttlockKeyId).catch(() => undefined);
      }
      await this.prisma.digitalKey.update({
        where: { id: key.id },
        data: {
          status: KeyStatus.REVOKED,
          revokedAt: new Date(),
          pinEncrypted: null,
          logs: { create: { event: 'revoked', actor } },
        },
      });
    }
  }

  /**
   * Перевыпуск ключа после смены дат/времени брони: старый код удаляется, выдаётся
   * новый на актуальное окно (TTLock не даёт менять офлайн-код — поэтому revoke+issue,
   * PIN обновляется, гость видит новый в портале). Если перевыпуск не удался — задача
   * в отдел СПИР с описанием проблемы (просьба владельца).
   */
  async refreshForBooking(bookingId: string): Promise<void> {
    const active = await this.prisma.digitalKey.count({ where: { bookingId, status: KeyStatus.ACTIVE } });
    if (active === 0) return;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { guestId: true, tenantId: true, bookingNumber: true },
    });
    if (!booking) return;
    try {
      await this.revoke(bookingId, 'reschedule');
      await this.issue(booking.guestId, bookingId);
      this.logger.log(`Ключ перевыпущен после смены дат: бронь ${bookingId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Перевыпуск ключа после смены дат ${bookingId}: ${message}`);
      await this.escalation.escalateOnce({
        bookingId,
        dedupeKey: `${bookingId}:key_reschedule_failed`,
        kind: 'key_reschedule_failed',
        title: `Код замка не обновлён после смены дат брони`,
        description: `Даты/время брони № ${booking.bookingNumber ?? bookingId.slice(0, 8)} изменились, но код замка не удалось перевыпустить: ${message}. Проверьте замок и выдайте актуальный код вручную.`,
        groupId: await this.resolveSpirGroupId(booking.tenantId),
        important: true,
      });
    }
  }

  /** ID отдела СПИР (UserGroup) для эскалаций по замкам; null — если отдел не заведён. */
  private async resolveSpirGroupId(tenantId: string): Promise<string | null> {
    const grp = await this.prisma.userGroup
      .findFirst({ where: { tenantId, name: { contains: 'СПИР', mode: 'insensitive' } }, select: { id: true } })
      .catch(() => null);
    return grp?.id ?? null;
  }

  /** ФИО гостя для имени кода в TTLock (фамилия + имя; фолбэк — «Гость»). */
  private async guestNameFor(guestId: string): Promise<string> {
    const g = await this.prisma.guest
      .findUnique({ where: { id: guestId }, select: { firstName: true, lastName: true } })
      .catch(() => null);
    const name = [g?.lastName, g?.firstName].filter(Boolean).join(' ').trim();
    return name || 'Гость';
  }

  /** Авто-отзыв ключей с истёкшим окном действия (§9.4). */
  async autoRevokeExpired(now: Date = new Date()): Promise<number> {
    const expired = await this.prisma.digitalKey.findMany({
      where: { status: KeyStatus.ACTIVE, validUntil: { lt: now } },
      select: { bookingId: true },
      distinct: ['bookingId'],
    });
    for (const k of expired) await this.revoke(k.bookingId, 'auto');
    return expired.length;
  }

  // --- Внутреннее ---

  /** Случайный числовой PIN заданной длины (ведущие нули сохраняются). */
  private randomPin(length: number): string {
    return randomInt(0, 10 ** length).toString().padStart(length, '0');
  }

  private async issueOne(
    guestId: string,
    bookingId: string,
    lock: Lock,
    window: { start: Date; end: Date },
    sharedPin: string,
    guestName: string,
  ): Promise<boolean> {
    const key = await this.prisma.digitalKey.create({
      data: {
        bookingId,
        type: KeyType.PIN,
        target: lock.target,
        status: KeyStatus.ISSUING,
        lockId: lock.ttlockLockId,
        doorName: lock.name,
        validFrom: window.start,
        validUntil: window.end,
        logs: { create: { event: 'created', actor: guestId, detail: lock.name } },
      },
    });
    const startMs = window.start.getTime();
    const endMs = window.end.getTime();
    // Имя кода в TTLock — по гостю (для удобства персонала). Ограничение длины TTLock (~32).
    const name = `${guestName} · ${lock.name}`.slice(0, 32);

    // 1) Со шлюзом — пробуем записать ЕДИНЫЙ свой код (несколько попыток).
    if (lock.hasGateway) {
      const attempts = this.config.get('TTLOCK_ADD_ATTEMPTS', { infer: true });
      for (let i = 1; i <= attempts; i++) {
        try {
          const result = await this.ttlock.createPasscode({
            lockId: lock.ttlockLockId,
            pin: sharedPin,
            mode: 'add',
            startMs,
            endMs,
            name,
          });
          await this.activateKey(key.id, result.ttlockKeyId, result.pin, 'unified');
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Единый код "${lock.name}" (${bookingId}), попытка ${i}/${attempts}: ${message}`);
          await this.prisma.digitalKey.update({
            where: { id: key.id },
            data: { logs: { create: { event: 'error', detail: `add-попытка ${i}: ${message}` } } },
          });
        }
      }
    }

    // 2) Временный код: без шлюза либо после неудачных попыток единого — код по
    //    алгоритму TTLock (mode 'get', работает офлайн, свой для каждой двери).
    try {
      const result = await this.ttlock.createPasscode({ lockId: lock.ttlockLockId, mode: 'get', startMs, endMs, name });
      await this.activateKey(key.id, result.ttlockKeyId, result.pin, lock.hasGateway ? 'temporary_after_retries' : 'temporary_no_gateway');
      if (lock.hasGateway) {
        this.logger.warn(`"${lock.name}" (${bookingId}): единый код не записан — выдан временный.`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.digitalKey.update({
        where: { id: key.id },
        data: { status: KeyStatus.FAILED, logs: { create: { event: 'error', detail: message } } },
      });
      this.logger.error(`Ключ для "${lock.name}" (${bookingId}): ${message}`);
      // Эскалация в собственные задачи (ops), не в Bitrix24 (CHECK-IN-TZ §6.5).
      await this.escalation.escalateOnce({
        bookingId,
        dedupeKey: `${bookingId}:key_failed:${lock.ttlockLockId}`,
        kind: 'key_failed',
        title: `Проблема с цифровым ключом: ${lock.name}`,
        description: `Не удалось создать код TTLock. ${message}. Выдайте резервный код администратора.`,
      });
      return false;
    }
  }

  /** Пометить ключ активным (код записан на замок); kind — как именно выдан. */
  private async activateKey(keyId: string, ttlockKeyId: string, pin: string, kind: string): Promise<void> {
    await this.prisma.digitalKey.update({
      where: { id: keyId },
      data: {
        status: KeyStatus.ACTIVE,
        ttlockKeyId,
        pinEncrypted: this.crypto.encryptPii(pin),
        issuedAt: new Date(),
        logs: { create: { event: 'issued', detail: `${kind}:${ttlockKeyId}` } },
      },
    });
  }

  /**
   * Замки, открывающие назначенный номер брони: личная дверь + общие двери,
   * чья зона покрытия (объект/этаж/список) включает этот номер (§9.1).
   */
  private async locksForBooking(booking: {
    propertyId: string;
    room: { id: string; floor: string | null } | null;
  }): Promise<Lock[]> {
    if (!booking.room) return [];
    const room: CoverageRoom = {
      id: booking.room.id,
      propertyId: booking.propertyId,
      floor: booking.room.floor,
    };
    const locks = await this.prisma.lock.findMany({
      where: { active: true, propertyId: booking.propertyId },
      include: { roomLinks: { select: { roomId: true } } },
      orderBy: { target: 'asc' },
    });
    return locks.filter((lock) =>
      lockCoversRoom(
        {
          propertyId: lock.propertyId,
          coverage: lock.coverage,
          coverageFloor: lock.coverageFloor,
          roomIds: lock.roomLinks.map((r) => r.roomId),
        },
        room,
      ),
    );
  }

  private async buildView(
    bookingId: string,
    locks: Lock[],
    window: { start: Date; end: Date },
    eligible: boolean,
    reasons: string[],
  ): Promise<KeysView> {
    const keys = await this.prisma.digitalKey.findMany({
      where: { bookingId, status: KeyStatus.ACTIVE },
    });
    const byLock = new Map(keys.map((k) => [k.lockId, k]));
    const now = new Date();

    const doors: KeyDoor[] = locks.map((lock) => {
      const k = byLock.get(lock.ttlockLockId);
      const showPin =
        k?.pinEncrypted && now >= k.validFrom && now <= k.validUntil
          ? this.crypto.decryptPii(k.pinEncrypted)
          : null;
      return {
        doorName: lock.name,
        target: lock.target,
        status: k ? KeyStatus.ACTIVE : 'NOT_ISSUED',
        pin: showPin,
        ttlockLockId: lock.ttlockLockId,
        canRemoteOpen: lock.hasGateway,
      };
    });

    return {
      eligible: eligible && locks.length > 0,
      reasons: locks.length === 0 ? ['Для номера не настроены замки'] : reasons,
      validFrom: window.start,
      validUntil: window.end,
      doors,
    };
  }

  private async loadContext(guestId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, guestId },
      include: { property: true, checkin: true, room: { select: { id: true, floor: true, address: true, checkinInstructions: true } } },
    });
    if (!booking) throw new NotFoundException('Бронирование не найдено');

    // Конструктор воронки (CHECK-IN-TZ §2): выключенный/необязательный этап снимает
    // шлюз регистрации/оплаты. Читаем конфиг напрямую (без CheckinModule — иначе цикл).
    const gates = await this.gateOverrides(booking.tenantId, booking.propertyId);

    // Timing этапа key_issue переопределяет env-окно (−30/+30 по умолчанию).
    const checkinAt = combineDateAndTime(booking.checkIn, booking.property.checkInTime, '14:00');
    const checkoutAt = combineDateAndTime(booking.checkOut, booking.property.checkOutTime, '12:00');
    const window = computeKeyValidityWindow({
      checkinAt,
      checkoutAt,
      preCheckinMinutes: gates.preCheckinMinutes ?? this.config.get('KEY_PRE_CHECKIN_MINUTES', { infer: true }),
      postCheckoutMinutes: gates.postCheckoutMinutes ?? this.config.get('KEY_POST_CHECKOUT_MINUTES', { infer: true }),
    });
    return { booking, window, gates };
  }

  private decide(
    booking: { status: BookingStatus; paymentStatus: PaymentStatus; checkin: { status: CheckinStatus } | null },
    window: { start: Date; end: Date },
    gates?: { registrationRequired: boolean; paymentRequired: boolean },
  ) {
    return canIssueKey({
      bookingStatus: booking.status as unknown as DomainBookingStatus,
      checkinStatus: (booking.checkin?.status ?? CheckinStatus.NOT_STARTED) as unknown as DomainCheckinStatus,
      paymentSatisfied: booking.paymentStatus === PaymentStatus.PAID,
      paymentRequired: gates?.paymentRequired ?? true,
      registrationRequired: gates?.registrationRequired ?? true,
      now: new Date(),
      window,
    });
  }

  /** Шлюзы/окно из активной воронки объекта (PROPERTY-переопределение, иначе default). */
  private async gateOverrides(tenantId: string, propertyId: string) {
    const funnel =
      (await this.prisma.checkinFunnel.findFirst({
        where: { tenantId, active: true, propertyId },
        include: { stages: true },
      })) ??
      (await this.prisma.checkinFunnel.findFirst({
        where: { tenantId, active: true, isDefault: true },
        include: { stages: true },
      }));
    const stage = (key: string) => funnel?.stages.find((s) => s.key === key);
    const blocks = (key: string) => {
      const s = stage(key);
      return s ? s.enabled && s.required : true; // нет конфига — как зашитая логика
    };
    const timing = (stage('key_issue')?.timing ?? null) as { preCheckinMinutes?: number; postCheckoutMinutes?: number } | null;
    return {
      registrationRequired: blocks('registration'),
      paymentRequired: blocks('payment'),
      preCheckinMinutes: timing?.preCheckinMinutes,
      postCheckoutMinutes: timing?.postCheckoutMinutes,
    };
  }
}
