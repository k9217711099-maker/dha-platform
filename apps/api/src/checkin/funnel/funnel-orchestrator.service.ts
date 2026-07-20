import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, KeyStatus, PaymentStatus, Prisma } from '@prisma/client';
import {
  BookingStatus as DomainBookingStatus,
  CheckinStatus as DomainCheckinStatus,
  computeFunnelStage,
  computeKeyValidityWindow,
  FunnelStage,
  NotificationChannel,
} from '@dha/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { KeysService } from '../../keys/keys.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type { Scenario } from '../../notifications/scenarios.js';
import { SCENARIOS } from '../../notifications/scenarios.js';
import { PmsBookingService } from '../../pms/bookings/pms-booking.service.js';
import { combineDateAndTime } from '../../keys/key-window.js';
import { OtaMessagingPort } from '../../integrations/ota-messaging/ota-messaging.port.js';
import { FunnelEscalationService } from './funnel-escalation.service.js';
import { GuestCheckinLinkService } from '../portal/guest-checkin-link.service.js';
import type { Env } from '../../config/env.schema.js';

const BOOKING_INCLUDE = {
  guest: { select: { id: true, phone: true, email: true } },
  checkin: { select: { status: true } },
  property: { select: { id: true, name: true, checkInTime: true, checkOutTime: true, autoCheckin: true } },
  digitalKeys: { select: { status: true } },
} satisfies Prisma.BookingInclude;

type CandidateBooking = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

/** Конфиг-этап воронки, приведённый к рабочему виду. */
interface StageConfig {
  key: string;
  title: string;
  enabled: boolean;
  required: boolean;
  channels: string[];
  notificationTemplateKey: string | null;
  reminderPolicy: { offsetHours: number; channels?: string[] }[];
  timing: { preCheckinMinutes?: number; postCheckoutMinutes?: number } | null;
  staffTask: { enabled: boolean; groupId: string | null; offsetHours: number | null; title: string | null } | null;
}

/**
 * Оркестратор заселения (CHECK-IN-TZ §6): двигатель воронки. По расписанию и по
 * событиям ведёт бронь по шлюзам — приглашение, напоминания по каналам этапов,
 * авто-выдача ключа при READY, авто-заезд (property.autoCheckin), эскалации в
 * OpsTask, отзыв доступа после выезда. Все действия идемпотентны (FunnelEventLog).
 */
@Injectable()
export class FunnelOrchestratorService {
  private readonly logger = new Logger(FunnelOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
    private readonly notifications: NotificationsService,
    private readonly escalation: FunnelEscalationService,
    private readonly pmsBookings: PmsBookingService,
    private readonly links: GuestCheckinLinkService,
    private readonly otaMessaging: OtaMessagingPort,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Полный проход: активные брони в горизонте + выехавшие с активными ключами. */
  async tick(now: Date = new Date()): Promise<{ processed: number }> {
    const horizonMs = this.config.get('FUNNEL_HORIZON_HOURS', { infer: true }) * 3_600_000;
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        checkIn: { lte: new Date(now.getTime() + horizonMs), gte: new Date(now.getTime() - 48 * 3_600_000) },
      },
      include: BOOKING_INCLUDE,
    });
    for (const b of candidates) {
      await this.process(b, now).catch((e) =>
        this.logger.warn(`Воронка: бронь ${b.id} не обработана: ${String(e)}`),
      );
    }
    await this.revokeAfterCheckout(now);
    return { processed: candidates.length };
  }

  /** Точечный прогон одной брони (хук событий: approve регистрации, оплата). */
  async processBooking(bookingId: string, now: Date = new Date()): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking || booking.status !== BookingStatus.CONFIRMED) return;
    await this.process(booking, now).catch((e) =>
      this.logger.warn(`Воронка: бронь ${bookingId} не обработана: ${String(e)}`),
    );
  }

  /**
   * Ручная отправка приглашения гостю (кнопка «Отправить приглашение» в карточке
   * брони). В отличие от воронки — шлёт всегда (без дедупа FunnelEventLog), чтобы
   * оператор мог доставить/переотправить анкету по требованию. Возвращает исход по
   * каждому каналу (для показа статуса и ошибки SMTP в UI). channels — ограничить
   * набор (напр. только email); пусто — дефолтные каналы сценария.
   */
  async sendInviteNow(
    bookingId: string,
    channels?: NotificationChannel[],
  ): Promise<{ link: string | null; results: { channel: NotificationChannel; status: 'sent' | 'skipped' | 'failed'; error?: string }[] }> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { guestId: true, property: { select: { name: true } } },
    });
    if (!b) return { link: null, results: [] };
    const link = await this.links.issueFor(bookingId).catch(() => null);
    const results = await this.notifications.notifyWithResult(
      b.guestId,
      'CHECKIN_INVITE',
      { property: b.property.name, ...(link ? { link: link.url } : {}) },
      channels?.length ? channels : undefined,
    );
    return { link: link?.url ?? null, results };
  }

  // --- Внутреннее ---

  private async process(b: CandidateBooking, now: Date): Promise<void> {
    const stages = await this.stagesFor(b.tenantId, b.propertyId);
    const keyStage = stages.find((s) => s.key === 'key_issue' && s.enabled);

    // Окно ключа: timing этапа key_issue переопределяет env-дефолты (§2.1).
    const checkinAt = combineDateAndTime(b.checkIn, b.property.checkInTime, '14:00');
    const checkoutAt = combineDateAndTime(b.checkOut, b.property.checkOutTime, '12:00');
    const window = computeKeyValidityWindow({
      checkinAt,
      checkoutAt,
      preCheckinMinutes:
        keyStage?.timing?.preCheckinMinutes ?? this.config.get('KEY_PRE_CHECKIN_MINUTES', { infer: true }),
      postCheckoutMinutes:
        keyStage?.timing?.postCheckoutMinutes ?? this.config.get('KEY_POST_CHECKOUT_MINUTES', { infer: true }),
    });

    const hasContact = Boolean(b.guest?.phone || b.guest?.email);
    const registrationRequired = this.stageBlocks(stages, 'registration');
    const paymentRequired = this.stageBlocks(stages, 'payment');
    const view = computeFunnelStage({
      bookingStatus: b.status as unknown as DomainBookingStatus,
      checkinStatus: (b.checkin?.status ?? 'NOT_STARTED') as unknown as DomainCheckinStatus,
      hasVerifiedContact: hasContact,
      // Выключенный/необязательный этап воронки снимает шлюз (§2.1: required=false).
      paymentSatisfied: !paymentRequired || b.paymentStatus === PaymentStatus.PAID,
      paymentRequired: true,
      roomAssigned: b.roomId !== null,
      hasActiveKey: b.digitalKeys.some((k) => k.status === KeyStatus.ACTIVE),
      now,
      window,
    });
    // Регистрация выключена конструктором — гейт не держит воронку (кроме ключевого canIssueKey, см. ниже).
    const stage =
      !registrationRequired && view.stage === FunnelStage.IDENTIFIED && hasContact
        ? this.stageIgnoringRegistration(b, hasContact, paymentRequired, now, window)
        : view.stage;

    if (b.funnelStage !== stage) {
      await this.prisma.booking.update({ where: { id: b.id }, data: { funnelStage: stage } }).catch(() => undefined);
    }

    // 1) Приглашение в воронку — один раз, когда есть как достучаться (§6.1).
    // Вместе с приглашением выпускается magic-link на гостевой портал (§4).
    if (hasContact && [FunnelStage.IDENTIFIED, FunnelStage.REGISTERED, FunnelStage.PAID].includes(stage)) {
      const ident = stages.find((s) => s.key === 'identification' && s.enabled);
      const link = await this.links.issueFor(b.id).catch(() => null);
      await this.sendOnce(
        b,
        `${b.id}:invite`,
        'invite',
        ident?.notificationTemplateKey ?? 'CHECKIN_INVITE',
        ident?.channels,
        link ? { link: link.url } : {},
      );
    }

    // 2) Напоминания по reminderPolicy незакрытых этапов (§6.2).
    if (stage === FunnelStage.IDENTIFIED && registrationRequired) {
      await this.remind(b, stages, 'registration', checkinAt, now, 'заполните данные гостей');
    }
    if ([FunnelStage.IDENTIFIED, FunnelStage.REGISTERED].includes(stage) && paymentRequired && b.paymentStatus !== PaymentStatus.PAID) {
      await this.remind(b, stages, 'payment', checkinAt, now, 'оплатите проживание');
    }

    // 2b) Задачи сотрудникам по этапам (§6.5): ставим задачу в отдел, ПОКА этап не пройден.
    // offsetHours пусто → сразу при постановке на этап; иначе — в момент checkinAt+offset.
    // Условие выполнено → задачу не ставим (или снимать её вручную). Идемпотентно (dedupeKey).
    for (const s of stages) {
      if (!s.enabled || !s.staffTask?.enabled) continue;
      if (this.stageConditionMet(s.key, view.gates)) continue;
      const fireAt = s.staffTask.offsetHours != null ? checkinAt.getTime() + s.staffTask.offsetHours * 3_600_000 : now.getTime();
      if (now.getTime() < fireAt) continue;
      await this.escalation.escalateOnce({
        bookingId: b.id,
        dedupeKey: `${b.id}:stafftask:${s.key}`,
        kind: 'stage_task',
        title: s.staffTask.title || `Заселение: ${s.title ?? s.key}`,
        description: `Гость на этапе «${s.title ?? s.key}» — условие пока не выполнено.`,
        groupId: s.staffTask.groupId,
        important: false,
      });
    }

    // 3) READY → авто-выдача ключа (идемпотентно: issue пропускает ACTIVE-ключи, §6.3).
    if (stage === FunnelStage.READY && keyStage) {
      try {
        await this.keys.issue(b.guestId, b.id);
        await this.logEvent(b, `${b.id}:key_auto_issue`, 'key_auto_issue', 'ключ выдан воронкой');
      } catch (e) {
        // Причина уже в DigitalKey FAILED + эскалация из KeysService; не спамим.
        this.logger.warn(`Авто-выдача ключа ${b.id}: ${String(e)}`);
      }
    }

    // 4) Ключ выдан + объект на автозаезде → CONFIRMED → CHECKED_IN (§6.3).
    const issuedNow =
      stage === FunnelStage.KEY_ISSUED ||
      (stage === FunnelStage.READY && (await this.hasActiveKey(b.id)));
    if (issuedNow && b.property.autoCheckin && b.status === BookingStatus.CONFIRMED) {
      try {
        await this.pmsBookings.checkIn(b.tenantId, b.id, {});
        await this.logEvent(b, `${b.id}:auto_checkin`, 'auto_checkin', 'автозаезд воронкой');
      } catch (e) {
        this.logger.warn(`Автозаезд ${b.id}: ${String(e)}`);
      }
    }

    // 5) Дедлайны: гость не готов после времени заезда → эскалация; авто-незаезд по настройке (§6.4).
    const notReady = ![FunnelStage.READY, FunnelStage.KEY_ISSUED, FunnelStage.COMPLETED].includes(stage);
    const escalateAfterMs = this.config.get('FUNNEL_ESCALATE_AFTER_MINUTES', { infer: true }) * 60_000;
    if (notReady && now.getTime() > checkinAt.getTime() + escalateAfterMs) {
      const missing = view.gates.filter((g) => !g.ok).map((g) => g.reason).join('; ');
      await this.escalation.escalateOnce({
        bookingId: b.id,
        dedupeKey: `${b.id}:escalation:not_ready`,
        kind: 'escalation',
        title: 'Заезд: гость не прошёл онлайн-заселение',
        description: `Время заезда наступило, воронка не завершена. Не хватает: ${missing || '—'}.`,
      });
    }
    const noShowHours = this.config.get('FUNNEL_NO_SHOW_AFTER_HOURS', { infer: true });
    if (noShowHours > 0 && notReady && now.getTime() > checkinAt.getTime() + noShowHours * 3_600_000) {
      try {
        await this.pmsBookings.noShow(b.tenantId, b.id);
        await this.logEvent(b, `${b.id}:no_show`, 'no_show', `авто-незаезд через ${noShowHours} ч`);
      } catch (e) {
        this.logger.warn(`Авто-незаезд ${b.id}: ${String(e)}`);
      }
    }
  }

  /** Выехавшие с активными ключами: отзыв доступа + прощальное уведомление (§6.6). */
  private async revokeAfterCheckout(now: Date): Promise<void> {
    const leftovers = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CHECKED_OUT,
        updatedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) },
        digitalKeys: { some: { status: KeyStatus.ACTIVE } },
      },
      include: BOOKING_INCLUDE,
    });
    for (const b of leftovers) {
      await this.keys.revoke(b.id, 'funnel').catch(() => undefined);
      await this.links.revokeFor(b.id); // magic-link умирает вместе с доступом (§4)
      await this.prisma.booking
        .update({ where: { id: b.id }, data: { funnelStage: FunnelStage.COMPLETED } })
        .catch(() => undefined);
      await this.sendOnce(b, `${b.id}:checkout_info`, 'checkout_revoke', 'CHECKOUT_INFO');
    }
  }

  /** Активная воронка объекта: PROPERTY-переопределение, иначе default тенанта. */
  private async stagesFor(tenantId: string, propertyId: string): Promise<StageConfig[]> {
    const funnel =
      (await this.prisma.checkinFunnel.findFirst({
        where: { tenantId, active: true, propertyId },
        include: { stages: { orderBy: { order: 'asc' } } },
      })) ??
      (await this.prisma.checkinFunnel.findFirst({
        where: { tenantId, active: true, isDefault: true },
        include: { stages: { orderBy: { order: 'asc' } } },
      }));
    return (funnel?.stages ?? []).map((s) => ({
      key: s.key,
      title: s.title,
      enabled: s.enabled,
      required: s.required,
      channels: s.channels,
      notificationTemplateKey: s.notificationTemplateKey,
      reminderPolicy: Array.isArray(s.reminderPolicy) ? (s.reminderPolicy as { offsetHours: number; channels?: string[] }[]) : [],
      timing: (s.timing ?? null) as StageConfig['timing'],
      staffTask: parseStaffTask(s.staffTask),
    }));
  }

  /** Выполнено ли условие этапа сейчас (по машинным шлюзам). custom — без стандартного шлюза. */
  private stageConditionMet(key: string, gates: { key: string; ok: boolean }[]): boolean {
    const ok = (k: string) => gates.find((g) => g.key === k)?.ok ?? false;
    switch (key) {
      case 'identification': return ok('contact_verified');
      case 'registration': return ok('registration_approved');
      case 'payment': return ok('payment_paid');
      case 'key_issue': return ok('room_assigned') && ok('time_window_open');
      default: return false;
    }
  }

  /** Этап включён и блокирующий? (нет конфига → считаем блокирующим, как зашитая логика). */
  private stageBlocks(stages: StageConfig[], key: string): boolean {
    const s = stages.find((x) => x.key === key);
    return s ? s.enabled && s.required : true;
  }

  /** Стадия при выключенной регистрации: пропускаем шлюз registration_approved. */
  private stageIgnoringRegistration(
    b: CandidateBooking,
    hasContact: boolean,
    paymentRequired: boolean,
    now: Date,
    window: { start: Date; end: Date },
  ): FunnelStage {
    const paid = !paymentRequired || b.paymentStatus === PaymentStatus.PAID;
    if (!paid) return FunnelStage.IDENTIFIED;
    const windowOpen = now >= window.start && now <= window.end;
    if (!(b.roomId !== null && windowOpen)) return FunnelStage.PAID;
    return b.digitalKeys.some((k) => k.status === KeyStatus.ACTIVE) ? FunnelStage.KEY_ISSUED : FunnelStage.READY;
  }

  /** Напоминание этапа по reminderPolicy: offsetHours относительно времени заезда. */
  private async remind(
    b: CandidateBooking,
    stages: StageConfig[],
    stageKey: string,
    checkinAt: Date,
    now: Date,
    pending: string,
  ): Promise<void> {
    const s = stages.find((x) => x.key === stageKey && x.enabled);
    if (!s) return;
    for (const r of s.reminderPolicy) {
      const fireAt = checkinAt.getTime() + r.offsetHours * 3_600_000;
      if (now.getTime() < fireAt) continue;
      await this.sendOnce(
        b,
        `${b.id}:reminder:${stageKey}:${r.offsetHours}`,
        'reminder',
        s.notificationTemplateKey ?? 'CHECKIN_REMINDER',
        r.channels ?? s.channels,
        { pending },
      );
    }
  }

  /** Отправить уведомление один раз (дедуп через FunnelEventLog) по каналам этапа. */
  private async sendOnce(
    b: CandidateBooking,
    dedupeKey: string,
    kind: string,
    templateKey: string,
    stageChannels?: string[],
    extraPayload: Record<string, string> = {},
  ): Promise<void> {
    const scenario = (templateKey in SCENARIOS ? templateKey : 'CHECKIN_REMINDER') as Scenario;
    const logged = await this.logEvent(b, dedupeKey, kind, scenario);
    if (!logged) return;
    const payload = { property: b.property.name, ...extraPayload };

    // OTA-messaging: приоритетный канал для OTA-броней (§3.2) — тред внутри агрегатора.
    // Пока noop-порт (§16.3 открыт): send() честно вернёт false, идём по фолбэку.
    if (stageChannels?.includes('ota_messaging') && b.channel === 'OTA') {
      const { title, body } = await this.notifications.renderScenario(b.tenantId, scenario, payload);
      const delivered = await this.otaMessaging
        .send({ bookingId: b.id, sourceName: b.sourceName, externalObjectId: b.externalObjectId, text: `${title}. ${body}` })
        .catch(() => false);
      if (delivered) return; // доставлено внутри OTA — дублировать sms/email не нужно
    }

    await this.notifications.notify(b.guestId, scenario, payload, mapChannels(stageChannels));
  }

  /** Записать событие; false — уже было (unique dedupeKey). */
  private async logEvent(b: CandidateBooking, dedupeKey: string, kind: string, detail: string): Promise<boolean> {
    try {
      await this.prisma.funnelEventLog.create({
        data: { tenantId: b.tenantId, bookingId: b.id, kind, dedupeKey, detail },
      });
      return true;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') {
        this.logger.warn(`Событие воронки не записано (${dedupeKey}): ${String(err)}`);
      }
      return false;
    }
  }

  private async hasActiveKey(bookingId: string): Promise<boolean> {
    const k = await this.prisma.digitalKey.findFirst({
      where: { bookingId, status: KeyStatus.ACTIVE },
      select: { id: true },
    });
    return k !== null;
  }
}

/**
 * Каналы этапа (строки конструктора) → каналы диспетчера уведомлений.
 * whatsapp пока не поддержан (нет Business API — §16.3), ota_messaging — свой порт.
 */
function mapChannels(stageChannels?: string[]): NotificationChannel[] | undefined {
  if (!stageChannels?.length) return undefined;
  const map: Record<string, NotificationChannel> = {
    push: NotificationChannel.PUSH,
    sms: NotificationChannel.SMS,
    email: NotificationChannel.EMAIL,
    telegram: NotificationChannel.TELEGRAM,
  };
  const mapped = stageChannels.map((c) => map[c]).filter((c): c is NotificationChannel => Boolean(c));
  return mapped.length ? mapped : undefined;
}

/** JSON поля staffTask этапа → рабочий вид (null, если действие выключено/не задано). */
function parseStaffTask(raw: unknown): StageConfig['staffTask'] {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!o.enabled) return null;
  return {
    enabled: true,
    groupId: typeof o.groupId === 'string' && o.groupId ? o.groupId : null,
    offsetHours: typeof o.offsetHours === 'number' && Number.isFinite(o.offsetHours) ? o.offsetHours : null,
    title: typeof o.title === 'string' && o.title ? o.title : null,
  };
}
