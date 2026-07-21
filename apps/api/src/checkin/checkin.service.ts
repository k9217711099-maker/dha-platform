import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckinStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { StoragePort } from '../integrations/storage/storage.port.js';
import { PassportPort, type RecognizeResult } from '../integrations/passport/passport.port.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FunnelOrchestratorService } from './funnel/funnel-orchestrator.service.js';
import { FunnelEscalationService } from './funnel/funnel-escalation.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import type { Env } from '../config/env.schema.js';
import type { SaveCheckinDto } from './dto/save-checkin.dto.js';

/** Паспорт гостя для админки (расшифровано; доступ логируется, 152-ФЗ). */
export interface AdminPassportView {
  bookingId: string | null;
  series: string | null;
  number: string | null;
  checkStatus: 'VALID' | 'INVALID' | 'MANUAL' | null;
  checkNote: string | null;
  documents: { id: string; contentType: string; createdAt: Date }[];
}

export interface CheckinView {
  id: string;
  bookingId: string;
  status: CheckinStatus;
  arrivalTime: string | null;
  departureTime: string | null;
  adults: number;
  children: unknown;
  hasPassportData: boolean;
  documentsCount: number;
  consentsSigned: boolean;
  houseRulesAccepted: boolean;
  rejectionReason: string | null;
  instructions: string | null;
  submittedAt: Date | null;
  passportCheckStatus: 'VALID' | 'INVALID' | 'MANUAL' | null;
  passportCheckNote: string | null;
}

/** Элемент очереди регистраций на проверку сотрудником (§8.4). */
export interface CheckinReviewItem {
  bookingId: string;
  guestId: string;
  status: CheckinStatus;
  property: string;
  adults: number;
  documentsCount: number;
  submittedAt: Date | null;
  passportCheckStatus: 'VALID' | 'INVALID' | 'MANUAL' | null;
  passportCheckNote: string | null;
}

/** Онлайн-регистрация гостя (§8). */
@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StoragePort,
    private readonly passport: PassportPort,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
    // Хук воронки заселения (§6.2); Optional — для юнит-тестов без модуля.
    @Optional() private readonly orchestrator?: FunnelOrchestratorService,
    // Эскалация «ранний заезд» в задачу; Optional — для юнит-тестов.
    @Optional() private readonly escalation?: FunnelEscalationService,
    // Аудит просмотра паспортных данных (152-ФЗ); Optional — для юнит-тестов.
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** Получить регистрацию по брони (или создать черновик). */
  async getOrStart(guestId: string, bookingId: string): Promise<CheckinView> {
    await this.assertBooking(guestId, bookingId);
    const existing = await this.prisma.checkin.findUnique({
      where: { bookingId },
      include: { _count: { select: { documents: true } } },
    });
    if (existing) return this.toView(existing, existing._count.documents);

    const created = await this.prisma.checkin.create({
      data: { bookingId, guestId, status: CheckinStatus.DRAFT },
    });
    return this.toView(created, 0);
  }

  /** Сохранить черновик анкеты. */
  async saveDraft(guestId: string, bookingId: string, dto: SaveCheckinDto): Promise<CheckinView> {
    await this.assertBooking(guestId, bookingId);
    const data: Prisma.CheckinUpdateInput = {
      arrivalTime: dto.arrivalTime,
      departureTime: dto.departureTime,
      adults: dto.adults,
      children: dto.children as unknown as Prisma.InputJsonValue | undefined,
      consentsSigned: dto.consentsSigned,
      houseRulesAccepted: dto.houseRulesAccepted,
      // Из NEEDS_FIX/REJECTED возвращаемся в черновик
      status: CheckinStatus.DRAFT,
    };
    if (dto.passport) {
      data.passportEncrypted = this.crypto.encryptPii(JSON.stringify(dto.passport));
    }

    const checkin = await this.prisma.checkin.upsert({
      where: { bookingId },
      create: {
        bookingId,
        guestId,
        status: CheckinStatus.DRAFT,
        arrivalTime: dto.arrivalTime,
        departureTime: dto.departureTime,
        adults: dto.adults ?? 1,
        children: (dto.children ?? []) as unknown as Prisma.InputJsonValue,
        consentsSigned: dto.consentsSigned ?? false,
        houseRulesAccepted: dto.houseRulesAccepted ?? false,
        passportEncrypted: dto.passport
          ? this.crypto.encryptPii(JSON.stringify(dto.passport))
          : null,
      },
      update: data,
      include: { _count: { select: { documents: true } } },
    });
    return this.toView(checkin, checkin._count.documents);
  }

  /** Загрузить скан паспорта (шифруется перед сохранением в Object Storage). */
  async uploadPassport(
    guestId: string,
    bookingId: string,
    file: { buffer: Buffer; mimetype: string },
  ): Promise<{ documentId: string }> {
    await this.assertBooking(guestId, bookingId);
    const checkin = await this.prisma.checkin.findUnique({ where: { bookingId } });
    if (!checkin) throw new BadRequestException('Сначала начните регистрацию');

    const key = `passports/${guestId}/${bookingId}/${randomUUID()}.enc`;
    const encrypted = this.crypto.encryptBuffer(file.buffer);
    await this.storage.put(key, encrypted, 'application/octet-stream');

    const retentionDays = this.config.get('DOCUMENT_RETENTION_DAYS', { infer: true });
    const retentionUntil = new Date(Date.now() + retentionDays * 86_400_000);

    const doc = await this.prisma.document.create({
      data: {
        guestId,
        checkinId: checkin.id,
        kind: 'passport',
        storageKey: key,
        contentType: file.mimetype,
        retentionUntil,
        accessLogs: { create: { actor: guestId, action: 'upload' } },
      },
    });
    return { documentId: doc.id };
  }

  /**
   * Распознать паспорт со скана (OCR) — поля для автозаполнения формы.
   * Скан расшифровывается и передаётся в OCR (по умолчанию — наш self-hosted сервис).
   */
  async recognizePassport(guestId: string, bookingId: string): Promise<RecognizeResult> {
    await this.assertBooking(guestId, bookingId);
    const checkin = await this.prisma.checkin.findUnique({ where: { bookingId } });
    if (!checkin) throw new BadRequestException('Сначала начните регистрацию');

    const doc = await this.prisma.document.findFirst({
      where: { checkinId: checkin.id, kind: 'passport' },
      orderBy: { createdAt: 'desc' },
    });
    if (!doc) throw new BadRequestException('Сначала загрузите скан паспорта');

    const encrypted = await this.storage.get(doc.storageKey);
    const scan = this.crypto.decryptBuffer(encrypted);
    // Лог доступа к скану (§18.2)
    await this.prisma.documentAccessLog.create({ data: { documentId: doc.id, actor: guestId, action: 'ocr' } });

    return this.passport.recognize(scan, doc.contentType);
  }

  /** Авто-проверка действительности паспорта; результат сохраняется на регистрации. */
  private async runPassportVerification(bookingId: string, passportEncrypted: string | null): Promise<void> {
    let input: { series?: string; number?: string; birthDate?: string } = {};
    if (passportEncrypted) {
      try {
        input = JSON.parse(this.crypto.decryptPii(passportEncrypted)) as typeof input;
      } catch {
        /* пустые данные — проверка вернёт MANUAL */
      }
    }
    let status: 'VALID' | 'INVALID' | 'MANUAL' = 'MANUAL';
    let note = 'Проверка не выполнена.';
    try {
      const res = await this.passport.verify(input);
      status = res.verdict;
      note = res.note;
    } catch (e) {
      note = `Сервис проверки недоступен: ${(e as Error).message}`;
    }
    await this.prisma.checkin.update({
      where: { bookingId },
      data: { passportCheckStatus: status, passportCheckNote: note, passportCheckAt: new Date() },
    });
  }

  /** Отправить регистрацию на проверку (§8.3). */
  async submit(guestId: string, bookingId: string): Promise<CheckinView> {
    await this.assertBooking(guestId, bookingId);
    const checkin = await this.prisma.checkin.findUnique({
      where: { bookingId },
      include: { _count: { select: { documents: true } } },
    });
    if (!checkin) throw new BadRequestException('Регистрация не начата');

    if (!checkin.passportEncrypted) throw new BadRequestException('Заполните паспортные данные');
    if (checkin._count.documents === 0) throw new BadRequestException('Загрузите скан паспорта');
    if (!checkin.consentsSigned) throw new BadRequestException('Подпишите согласия');
    if (!checkin.houseRulesAccepted) throw new BadRequestException('Подтвердите правила проживания');

    // Авто-проверка действительности паспорта (результат увидит администратор в очереди)
    await this.runPassportVerification(bookingId, checkin.passportEncrypted);

    const updated = await this.prisma.checkin.update({
      where: { bookingId },
      data: { status: CheckinStatus.SUBMITTED, submittedAt: new Date() },
      include: {
        _count: { select: { documents: true } },
        booking: { select: { property: { select: { checkInTime: true } } } },
      },
    });
    // Ранний заезд: гость просит время раньше стандартного заезда объекта → задача персоналу
    // на подтверждение готовности номера/доплаты. Идемпотентно (dedupeKey с временем).
    const stdCheckin = updated.booking.property.checkInTime;
    if (updated.arrivalTime && stdCheckin && updated.arrivalTime < stdCheckin) {
      await this.escalation
        ?.escalateOnce({
          bookingId,
          dedupeKey: `${bookingId}:early_checkin:${updated.arrivalTime}`,
          kind: 'early_checkin',
          title: `Ранний заезд: гость просит ${updated.arrivalTime}`,
          description: `Гость запросил заезд в ${updated.arrivalTime} (стандарт объекта — ${stdCheckin}). Подтвердите готовность номера и при необходимости доплату за ранний заезд.`,
          important: false,
        })
        .catch(() => undefined);
    }
    return this.toView(updated, updated._count.documents);
  }

  // --- Действия сотрудника (используются админ-панелью, блок 12) ---

  /**
   * Очередь регистраций на проверку сотрудником (§8.4). По умолчанию — статус
   * SUBMITTED (отправленные гостем). Фильтр по арендатору: только брони объектов
   * текущего тенанта.
   */
  async listForReview(
    tenantId: string,
    status: CheckinStatus = CheckinStatus.SUBMITTED,
  ): Promise<CheckinReviewItem[]> {
    const rows = await this.prisma.checkin.findMany({
      where: { status, booking: { tenantId } },
      include: {
        _count: { select: { documents: true } },
        booking: { include: { property: { select: { name: true } } } },
      },
      orderBy: { submittedAt: 'asc' },
    });
    return rows.map((c) => ({
      bookingId: c.bookingId,
      guestId: c.guestId,
      status: c.status,
      property: c.booking.property.name,
      adults: c.adults,
      documentsCount: c._count.documents,
      submittedAt: c.submittedAt,
      passportCheckStatus: c.passportCheckStatus,
      passportCheckNote: c.passportCheckNote,
    }));
  }

  /** Расшифровать паспорт {series, number} из зашифрованного поля (пустой при ошибке). */
  private decodePassport(enc: string | null): { series: string | null; number: string | null } {
    if (!enc) return { series: null, number: null };
    try {
      const p = JSON.parse(this.crypto.decryptPii(enc)) as { series?: string; number?: string };
      return { series: p.series ?? null, number: p.number ?? null };
    } catch {
      return { series: null, number: null };
    }
  }

  private toPassportView(
    c: { bookingId: string; passportEncrypted: string | null; passportCheckStatus: 'VALID' | 'INVALID' | 'MANUAL' | null; passportCheckNote: string | null; documents: { id: string; contentType: string; createdAt: Date }[] } | null,
  ): AdminPassportView {
    if (!c) return { bookingId: null, series: null, number: null, checkStatus: null, checkNote: null, documents: [] };
    const { series, number } = this.decodePassport(c.passportEncrypted);
    return { bookingId: c.bookingId, series, number, checkStatus: c.passportCheckStatus, checkNote: c.passportCheckNote, documents: c.documents };
  }

  private static readonly PASSPORT_DOC_SELECT = {
    id: true,
    passportEncrypted: true,
    passportCheckStatus: true,
    passportCheckNote: true,
    bookingId: true,
    documents: {
      where: { kind: 'passport' },
      select: { id: true, contentType: true, createdAt: true },
      orderBy: { createdAt: 'desc' as const },
    },
  } as const;

  /** Паспортные данные + сканы по брони (админ, право checkins). Доступ логируется. */
  async passportForBooking(tenantId: string, bookingId: string, actorId: string): Promise<AdminPassportView> {
    const c = await this.prisma.checkin.findFirst({
      where: { bookingId, booking: { tenantId } },
      select: CheckinService.PASSPORT_DOC_SELECT,
    });
    if (c) await this.audit?.record({ tenantId, actorId, action: 'passport_viewed', entity: 'Checkin', entityId: c.id, payload: { bookingId } });
    return this.toPassportView(c);
  }

  /** Паспортные данные + сканы гостя (последняя регистрация с данными/сканом). */
  async passportForGuest(tenantId: string, guestId: string, actorId: string): Promise<AdminPassportView> {
    const c = await this.prisma.checkin.findFirst({
      where: { guestId, booking: { tenantId }, OR: [{ passportEncrypted: { not: null } }, { documents: { some: { kind: 'passport' } } }] },
      orderBy: { updatedAt: 'desc' },
      select: CheckinService.PASSPORT_DOC_SELECT,
    });
    if (c) await this.audit?.record({ tenantId, actorId, action: 'passport_viewed', entity: 'Guest', entityId: guestId, payload: { bookingId: c.bookingId } });
    return this.toPassportView(c);
  }

  /** Скан паспорта как data-URL (расшифровка). Доступ логируется (documentAccessLog). */
  async passportDocument(tenantId: string, docId: string, actorId: string): Promise<{ dataUrl: string; contentType: string }> {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, kind: 'passport', checkin: { booking: { tenantId } } },
    });
    if (!doc) throw new NotFoundException('Скан не найден');
    const encrypted = await this.storage.get(doc.storageKey);
    const buf = this.crypto.decryptBuffer(encrypted);
    await this.prisma.documentAccessLog.create({ data: { documentId: doc.id, actor: actorId, action: 'view' } });
    return { dataUrl: `data:${doc.contentType};base64,${buf.toString('base64')}`, contentType: doc.contentType };
  }

  /** Статус распознавания паспортов: провайдер + доступен ли self-hosted OCR-сайдкар. */
  async ocrStatus(): Promise<{ provider: string; reachable: boolean; note: string }> {
    const provider = this.config.get('PASSPORT_PROVIDER', { infer: true });
    if (provider !== 'http') {
      return { provider, reachable: false, note: 'Демо-режим (mock): скан не распознаётся, поля вводятся вручную. Включите OCR (PASSPORT_PROVIDER=http + сайдкар).' };
    }
    const base = this.config.get('PASSPORT_OCR_URL', { infer: true });
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${base}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      return { provider, reachable: res.ok, note: res.ok ? 'OCR-сайдкар доступен — распознавание работает.' : `OCR-сайдкар ответил ${res.status}.` };
    } catch (e) {
      return { provider, reachable: false, note: `OCR-сайдкар недоступен (${base}): ${(e as Error).message}` };
    }
  }

  /** Подтвердить регистрацию (§8.4): инструкции, генерация ключа, передача в Bitrix24. */
  async approve(bookingId: string): Promise<CheckinView> {
    const checkin = await this.prisma.checkin.update({
      where: { bookingId },
      data: {
        status: CheckinStatus.APPROVED,
        reviewedAt: new Date(),
        instructions:
          'Регистрация подтверждена. Цифровой ключ будет доступен за 30 минут до заезда в разделе бронирования.',
      },
      include: { _count: { select: { documents: true } } },
    });
    await this.onApproved(bookingId);

    // Уведомление о подтверждении регистрации (§16)
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { property: true },
    });
    if (booking) {
      await this.notifications.notify(booking.guestId, 'CHECKIN_APPROVED', {
        property: booking.property.name,
      });
    }
    return this.toView(checkin, checkin._count.documents);
  }

  async reject(bookingId: string, reason: string, needsFix = false): Promise<CheckinView> {
    const checkin = await this.prisma.checkin.update({
      where: { bookingId },
      data: {
        status: needsFix ? CheckinStatus.NEEDS_FIX : CheckinStatus.REJECTED,
        rejectionReason: reason,
        reviewedAt: new Date(),
      },
      include: { _count: { select: { documents: true } } },
    });
    return this.toView(checkin, checkin._count.documents);
  }

  /**
   * Пост-обработка одобрения: точечный прогон оркестратора заселения
   * (CHECK-IN-TZ §6.2) — пересчёт стадии, выдача ключа при READY, уведомления.
   * Bitrix24 из ядра выведен — эскалации идут в собственные задачи ops.
   */
  private async onApproved(bookingId: string): Promise<void> {
    this.logger.log(`Регистрация ${bookingId} подтверждена — прогон воронки заселения`);
    await this.orchestrator?.processBooking(bookingId).catch(() => undefined);
  }

  private async assertBooking(guestId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, guestId } });
    if (!booking) throw new NotFoundException('Бронирование не найдено');
  }

  private toView(c: {
    id: string;
    bookingId: string;
    status: CheckinStatus;
    arrivalTime: string | null;
    departureTime: string | null;
    adults: number;
    children: unknown;
    passportEncrypted: string | null;
    passportCheckStatus?: 'VALID' | 'INVALID' | 'MANUAL' | null;
    passportCheckNote?: string | null;
    consentsSigned: boolean;
    houseRulesAccepted: boolean;
    rejectionReason: string | null;
    instructions: string | null;
    submittedAt: Date | null;
  }, documentsCount: number): CheckinView {
    return {
      id: c.id,
      bookingId: c.bookingId,
      status: c.status,
      arrivalTime: c.arrivalTime,
      departureTime: c.departureTime,
      adults: c.adults,
      children: c.children,
      hasPassportData: c.passportEncrypted !== null,
      documentsCount,
      consentsSigned: c.consentsSigned,
      houseRulesAccepted: c.houseRulesAccepted,
      rejectionReason: c.rejectionReason,
      instructions: c.instructions,
      submittedAt: c.submittedAt,
      passportCheckStatus: c.passportCheckStatus ?? null,
      passportCheckNote: c.passportCheckNote ?? null,
    };
  }
}
