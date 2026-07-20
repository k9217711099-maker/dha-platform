import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FUNNEL_PROTECTED_STAGE_KEYS } from '@dha/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import type { CreateStageDto, ReorderStagesDto, UpsertFunnelDto, UpsertStageDto } from './dto/funnel-config.dto.js';

const STAGE_INCLUDE = { stages: { orderBy: { order: 'asc' as const } } };

/**
 * Конструктор воронки заселения (CHECK-IN-TZ §2): CRUD конфигурации этапов/условий/
 * каналов. Из коробки — default-воронка, эквивалентная зашитой логике (§2.2), чтобы
 * ничего не сломать. Защищённые шлюзы (регистрация/оплата) выключаются только с
 * подтверждением (force); key_issue выключить нельзя. Все изменения — в аудит.
 */
@Injectable()
export class FunnelConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Все воронки тенанта (default создаётся при первом обращении). */
  async list(tenantId: string) {
    await this.ensureDefault(tenantId);
    return this.prisma.checkinFunnel.findMany({
      where: { tenantId },
      include: STAGE_INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const funnel = await this.prisma.checkinFunnel.findFirst({ where: { id, tenantId }, include: STAGE_INCLUDE });
    if (!funnel) throw new NotFoundException('Воронка не найдена');
    return funnel;
  }

  /** Новая воронка (переопределение для объекта или альтернативная сетевая). */
  async create(tenantId: string, dto: UpsertFunnelDto, actorId?: string) {
    const funnel = await this.prisma.checkinFunnel.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        active: dto.active ?? true,
        scope: dto.propertyId ? 'PROPERTY' : 'TENANT',
        propertyId: dto.propertyId ?? null,
        stages: { create: defaultStages() },
      },
      include: STAGE_INCLUDE,
    });
    await this.audit.record({ tenantId, actorId, action: 'funnel_created', entity: 'CheckinFunnel', entityId: funnel.id, payload: { name: dto.name } });
    return funnel;
  }

  async update(tenantId: string, id: string, dto: UpsertFunnelDto, actorId?: string) {
    await this.get(tenantId, id);
    const funnel = await this.prisma.checkinFunnel.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        active: dto.active,
        scope: dto.propertyId ? 'PROPERTY' : 'TENANT',
        propertyId: dto.propertyId ?? null,
      },
      include: STAGE_INCLUDE,
    });
    await this.audit.record({ tenantId, actorId, action: 'funnel_updated', entity: 'CheckinFunnel', entityId: id, payload: { name: dto.name } });
    return funnel;
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    const funnel = await this.get(tenantId, id);
    if (funnel.isDefault) throw new BadRequestException('Default-воронку удалить нельзя — отредактируйте её');
    await this.prisma.checkinFunnel.delete({ where: { id } });
    await this.audit.record({ tenantId, actorId, action: 'funnel_deleted', entity: 'CheckinFunnel', entityId: id, payload: { name: funnel.name } });
    return { ok: true };
  }

  // --- Этапы ---

  async createStage(tenantId: string, funnelId: string, dto: CreateStageDto, actorId?: string) {
    const funnel = await this.get(tenantId, funnelId);
    const order = dto.order ?? funnel.stages.length;
    await this.prisma.checkinFunnelStageConfig.create({
      data: {
        funnelId,
        key: dto.key,
        title: dto.title,
        order,
        enabled: dto.enabled ?? true,
        required: dto.required ?? true,
        conditions: (dto.conditions ?? []) as unknown as Prisma.InputJsonValue,
        channels: dto.channels ?? [],
        notificationTemplateKey: dto.notificationTemplateKey ?? null,
        reminderPolicy: (dto.reminderPolicy ?? undefined) as unknown as Prisma.InputJsonValue,
        timing: (dto.timing ?? undefined) as unknown as Prisma.InputJsonValue,
        staffTask: (dto.staffTask ?? undefined) as unknown as Prisma.InputJsonValue,
        sendTemplate: (dto.sendTemplate ?? undefined) as unknown as Prisma.InputJsonValue,
        setStatus: (dto.setStatus ?? undefined) as unknown as Prisma.InputJsonValue,
        guestDescription: dto.guestDescription ?? null,
        staffNote: dto.staffNote ?? null,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'funnel_stage_created', entity: 'CheckinFunnel', entityId: funnelId, payload: { key: dto.key, title: dto.title } });
    return this.get(tenantId, funnelId);
  }

  async updateStage(tenantId: string, funnelId: string, stageId: string, dto: UpsertStageDto, actorId?: string) {
    const stage = await this.assertStage(tenantId, funnelId, stageId);

    // Валидация защищённых шлюзов (§2.3).
    const disabling = dto.enabled === false || dto.required === false;
    if (disabling && stage.key === 'key_issue') {
      throw new BadRequestException('Этап «Готовность и ключ» отключить нельзя — без него воронка не выдаёт ключ');
    }
    if (disabling && (FUNNEL_PROTECTED_STAGE_KEYS as string[]).includes(stage.key) && !dto.force) {
      throw new BadRequestException(
        'Это защищённый шлюз (закон/безопасность). Подтвердите отключение явно (force=true)',
      );
    }

    await this.prisma.checkinFunnelStageConfig.update({ where: { id: stageId }, data: stageData(dto) });
    await this.audit.record({ tenantId, actorId, action: 'funnel_stage_updated', entity: 'CheckinFunnel', entityId: funnelId, payload: { stageId, key: stage.key, ...(disabling ? { disabled: true } : {}) } });
    return this.get(tenantId, funnelId);
  }

  async deleteStage(tenantId: string, funnelId: string, stageId: string, actorId?: string) {
    const stage = await this.assertStage(tenantId, funnelId, stageId);
    if (stage.key !== 'custom') {
      throw new BadRequestException('Типовой этап удалить нельзя — его можно выключить (custom-этапы удаляются)');
    }
    await this.prisma.checkinFunnelStageConfig.delete({ where: { id: stageId } });
    await this.audit.record({ tenantId, actorId, action: 'funnel_stage_deleted', entity: 'CheckinFunnel', entityId: funnelId, payload: { stageId, title: stage.title } });
    return this.get(tenantId, funnelId);
  }

  /** Смена порядка: массив id этапов в новом порядке (полный, §2.3). */
  async reorderStages(tenantId: string, funnelId: string, dto: ReorderStagesDto, actorId?: string) {
    const funnel = await this.get(tenantId, funnelId);
    const known = new Set(funnel.stages.map((s) => s.id));
    if (dto.stageIds.length !== known.size || dto.stageIds.some((id) => !known.has(id))) {
      throw new BadRequestException('Список этапов не совпадает с воронкой — обновите страницу');
    }
    await this.prisma.$transaction(
      dto.stageIds.map((id, order) =>
        this.prisma.checkinFunnelStageConfig.update({ where: { id }, data: { order } }),
      ),
    );
    await this.audit.record({ tenantId, actorId, action: 'funnel_stages_reordered', entity: 'CheckinFunnel', entityId: funnelId, payload: { order: dto.stageIds } });
    return this.get(tenantId, funnelId);
  }

  // --- Внутреннее ---

  /** Default-воронка §2.2 — создаётся один раз, эквивалентна текущей зашитой логике. */
  private async ensureDefault(tenantId: string): Promise<void> {
    const exists = await this.prisma.checkinFunnel.findFirst({ where: { tenantId, isDefault: true }, select: { id: true } });
    if (exists) return;
    await this.prisma.checkinFunnel
      .create({
        data: {
          tenantId,
          name: 'Стандартное заселение',
          description:
            'Воронка по умолчанию: контакт → онлайн-регистрация → оплата → ключ. ' +
            'Эквивалентна встроенным правилам выдачи ключа (canIssueKey).',
          isDefault: true,
          stages: { create: defaultStages() },
        },
      })
      .catch(() => undefined); // гонка двух запросов — второй просто найдёт созданную
  }

  private async assertStage(tenantId: string, funnelId: string, stageId: string) {
    const stage = await this.prisma.checkinFunnelStageConfig.findFirst({
      where: { id: stageId, funnelId, funnel: { tenantId } },
    });
    if (!stage) throw new NotFoundException('Этап не найден');
    return stage;
  }
}

/** Поля этапа из DTO (без key/title/order — они отдельно при создании). */
function stageData(dto: UpsertStageDto): Prisma.CheckinFunnelStageConfigUpdateInput {
  return {
    ...(dto.title !== undefined ? { title: dto.title } : {}),
    ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
    ...(dto.required !== undefined ? { required: dto.required } : {}),
    ...(dto.conditions !== undefined ? { conditions: dto.conditions as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.channels !== undefined ? { channels: dto.channels } : {}),
    ...(dto.notificationTemplateKey !== undefined ? { notificationTemplateKey: dto.notificationTemplateKey || null } : {}),
    ...(dto.reminderPolicy !== undefined ? { reminderPolicy: dto.reminderPolicy as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.timing !== undefined ? { timing: dto.timing as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.staffTask !== undefined ? { staffTask: dto.staffTask as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.sendTemplate !== undefined ? { sendTemplate: dto.sendTemplate as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.setStatus !== undefined ? { setStatus: dto.setStatus as unknown as Prisma.InputJsonValue } : {}),
    ...(dto.guestDescription !== undefined ? { guestDescription: dto.guestDescription || null } : {}),
    ...(dto.staffNote !== undefined ? { staffNote: dto.staffNote || null } : {}),
  };
}

/** Этапы default-воронки (CHECK-IN-TZ §2.2). */
function defaultStages() {
  return [
    {
      key: 'identification',
      title: 'Идентификация гостя',
      order: 0,
      conditions: [{ type: 'contact_verified' }],
      channels: ['push', 'sms', 'email'],
      notificationTemplateKey: 'CHECKIN_INVITE',
      guestDescription: 'Мы отправим ссылку для онлайн-заселения на ваш телефон или email.',
    },
    {
      key: 'registration',
      title: 'Онлайн-регистрация',
      order: 1,
      conditions: [{ type: 'registration_approved' }, { type: 'consents_signed' }],
      channels: ['push', 'sms', 'email'],
      notificationTemplateKey: 'CHECKIN_REMINDER',
      reminderPolicy: [{ offsetHours: -24 }, { offsetHours: -3 }],
      guestDescription:
        'Заполните данные гостей и загрузите документ заранее — заезд займёт меньше минуты.',
    },
    {
      key: 'payment',
      title: 'Оплата и депозит',
      order: 2,
      conditions: [{ type: 'payment_paid' }],
      channels: ['push', 'sms', 'email'],
      notificationTemplateKey: 'PAYMENT_REMINDER',
      reminderPolicy: [{ offsetHours: -24 }],
      guestDescription: 'Оплатите проживание онлайн. Депозит оплачивается только деньгами (не баллами).',
    },
    {
      key: 'key_issue',
      title: 'Готовность и ключ',
      order: 3,
      conditions: [{ type: 'room_assigned' }, { type: 'time_window_open' }],
      channels: ['push', 'sms'],
      notificationTemplateKey: 'KEY_READY',
      timing: { preCheckinMinutes: 30, postCheckoutMinutes: 30 },
      guestDescription: 'Ключ появится здесь за 30 минут до заезда. PIN действует до конца проживания.',
    },
  ];
}
