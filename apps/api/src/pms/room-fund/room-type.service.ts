import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AMENITY_CATEGORY_LABELS } from '@dha/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import type { CreateRoomTypeDto, ReorderRoomTypesDto, RoomTypeVisibilityDto, UpdateRoomTypeDto } from './dto/room-type.dto.js';

/**
 * Категории номеров (RoomType) для раздела «Номерной фонд» (Путь B).
 * Всё в контексте tenantId. Мутации пишут в аудит (журнал изменений раздела).
 * Порядок в списке — по sortOrder (drag). capacity держим как основные+доп. места
 * (нужен движку доступности), даже если владелец правит места по отдельности.
 */
@Injectable()
export class RoomTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Список категорий (по объекту или всех) с числом номеров; порядок sortOrder. */
  list(tenantId: string, propertyId?: string) {
    return this.prisma.roomType.findMany({
      where: { tenantId, propertyId },
      include: { property: { select: { id: true, name: true } }, _count: { select: { rooms: true } } },
      orderBy: [{ propertyId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const rt = await this.prisma.roomType.findFirst({
      where: { id, tenantId },
      include: { property: { select: { id: true, name: true } }, _count: { select: { rooms: true } } },
    });
    if (!rt) throw new NotFoundException('Категория не найдена');
    return rt;
  }

  async create(tenantId: string, dto: CreateRoomTypeDto, actorId?: string) {
    const property = await this.prisma.property.findFirst({ where: { id: dto.propertyId, tenantId }, select: { id: true } });
    if (!property) throw new BadRequestException('Объект размещения не найден');
    // sortOrder — в конец списка объекта.
    const last = await this.prisma.roomType.findFirst({ where: { tenantId, propertyId: dto.propertyId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const rt = await this.prisma.roomType.create({
      data: {
        tenantId,
        propertyId: dto.propertyId,
        name: dto.name,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        ...this.mapFields(dto),
        capacity: this.capacityOf(dto),
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'RoomType', entityId: rt.id, payload: { name: rt.name, propertyId: rt.propertyId } });
    return rt;
  }

  async update(tenantId: string, id: string, dto: UpdateRoomTypeDto, actorId?: string) {
    const current = await this.get(tenantId, id);
    const data: Prisma.RoomTypeUncheckedUpdateInput = { ...this.mapFields(dto) };
    // Пересчитываем capacity, если менялись места.
    if (dto.mainPlaces !== undefined || dto.extraPlaces !== undefined) {
      const mainPlaces = dto.mainPlaces ?? current.mainPlaces ?? current.capacity;
      const extraPlaces = dto.extraPlaces ?? current.extraPlaces;
      data.capacity = Math.max(1, mainPlaces + extraPlaces);
    }
    const rt = await this.prisma.roomType.update({ where: { id }, data });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'RoomType', entityId: id, payload: { ...dto } });
    return rt;
  }

  /** Копировать категорию (без номеров), в конец списка объекта. */
  async duplicate(tenantId: string, id: string, actorId?: string) {
    const src = await this.get(tenantId, id);
    const last = await this.prisma.roomType.findFirst({ where: { tenantId, propertyId: src.propertyId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const rt = await this.prisma.roomType.create({
      data: {
        tenantId,
        propertyId: src.propertyId,
        name: `${src.name} (копия)`,
        shortName: src.shortName,
        typeLabel: src.typeLabel,
        capacity: src.capacity,
        bedType: src.bedType,
        bedPreferences: src.bedPreferences,
        areaSqm: src.areaSqm,
        areaMode: src.areaMode,
        areaSqmTo: src.areaSqmTo,
        roomsInUnit: src.roomsInUnit,
        mainPlaces: src.mainPlaces,
        extraPlaces: src.extraPlaces,
        description: src.description,
        amenities: src.amenities,
        views: src.views,
        bedPreference: src.bedPreference,
        viewPreference: src.viewPreference,
        priorityAmenities: src.priorityAmenities,
        photos: src.photos,
        videos: src.videos,
        address: src.address,
        latitude: src.latitude,
        longitude: src.longitude,
        howToReach: src.howToReach,
        confirmationFileUrl: src.confirmationFileUrl,
        showInBooking: src.showInBooking,
        showInOta: src.showInOta,
        active: src.active,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'duplicated', entity: 'RoomType', entityId: rt.id, payload: { from: id, name: rt.name } });
    return rt;
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    const rt = await this.get(tenantId, id);
    if (rt._count.rooms > 0) throw new BadRequestException('Нельзя удалить категорию с номерами — сначала перенесите/удалите номера');
    await this.prisma.roomType.delete({ where: { id } });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'RoomType', entityId: id, payload: { name: rt.name } });
    return { ok: true };
  }

  /** Порядок категорий в объекте (drag): sortOrder = позиция в orderedIds. */
  async reorder(tenantId: string, dto: ReorderRoomTypesDto, actorId?: string) {
    const owned = await this.prisma.roomType.findMany({ where: { tenantId, propertyId: dto.propertyId }, select: { id: true } });
    const ids = new Set(owned.map((r) => r.id));
    if (!dto.orderedIds.every((id) => ids.has(id))) throw new BadRequestException('Список содержит чужие категории');
    await this.prisma.$transaction(dto.orderedIds.map((id, index) => this.prisma.roomType.update({ where: { id }, data: { sortOrder: index } })));
    await this.audit.record({ tenantId, actorId, action: 'reordered', entity: 'RoomType', entityId: dto.propertyId, payload: { orderedIds: dto.orderedIds } });
    return { ok: true };
  }

  /** Переключить тумблеры видимости (Бронирования / OTA). */
  async setVisibility(tenantId: string, id: string, dto: RoomTypeVisibilityDto, actorId?: string) {
    await this.get(tenantId, id);
    if (dto.showInBooking === undefined && dto.showInOta === undefined) throw new BadRequestException('Не указан ни один тумблер');
    const rt = await this.prisma.roomType.update({ where: { id }, data: { showInBooking: dto.showInBooking, showInOta: dto.showInOta } });
    await this.audit.record({ tenantId, actorId, action: 'visibility_changed', entity: 'RoomType', entityId: id, payload: { ...dto } });
    return rt;
  }

  /** Каталог оснащения (удобства) для редактора: сгруппировано по категориям (домен + TravelLine). */
  async amenitiesCatalog() {
    const all = await this.prisma.amenity.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] });
    const byCat = new Map<string, { code: string; label: string }[]>();
    for (const a of all) {
      const list = byCat.get(a.category) ?? [];
      list.push({ code: a.code, label: a.label });
      byCat.set(a.category, list);
    }
    // Подписи групп: доменные + расширенные TravelLine (порядок — сначала доменные).
    const extra: Record<string, string> = {
      TL_VIDEO: 'Видео/аудио', TL_ELECTRONICS: 'Электроника', TL_INTERNET: 'Интернет/телефония',
      TL_BATHROOM: 'Ванная комната', TL_FURNITURE: 'Мебель', TL_MISC: 'Прочее',
    };
    const labels: Record<string, string> = { ...AMENITY_CATEGORY_LABELS, ...extra };
    const order = [...Object.keys(AMENITY_CATEGORY_LABELS), 'TL_VIDEO', 'TL_ELECTRONICS', 'TL_INTERNET', 'TL_BATHROOM', 'TL_FURNITURE', 'TL_MISC'];
    const ordered = [...new Set([...order, ...byCat.keys()])];
    return ordered.filter((cat) => byCat.has(cat)).map((cat) => ({ value: cat, label: labels[cat] ?? cat, items: byCat.get(cat) ?? [] }));
  }

  /** Журнал изменений раздела (категории + номера), новые сверху; с фильтрами. Имя автора резолвим по actorId. */
  async changelog(tenantId: string, opts: { entity?: string; action?: string; from?: string; to?: string; take?: number } = {}) {
    const entity = opts.entity === 'RoomType' || opts.entity === 'Room' ? opts.entity : { in: ['RoomType', 'Room'] };
    const at: Prisma.DateTimeFilter = {};
    if (opts.from) at.gte = new Date(opts.from);
    if (opts.to) at.lte = new Date(`${opts.to}T23:59:59.999Z`);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entity,
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.from || opts.to ? { at } : {}),
      },
      orderBy: { at: 'desc' },
      take: Math.min(opts.take ?? 200, 500),
    });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
    const admins = actorIds.length ? await this.prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
    const nameById = new Map(admins.map((a) => [a.id, a.name ?? a.email]));
    return rows.map((r) => ({ ...r, actorName: r.actorName ?? (r.actorId ? nameById.get(r.actorId) ?? null : null) }));
  }

  /** Общие поля DTO → Prisma (без capacity — считается отдельно). Плоские значения — валидны и для create, и для update. */
  private mapFields(dto: CreateRoomTypeDto | UpdateRoomTypeDto): Partial<Prisma.RoomTypeUncheckedCreateInput> {
    const d: Partial<Prisma.RoomTypeUncheckedCreateInput> = {};
    if ('name' in dto && dto.name !== undefined) d.name = dto.name;
    if (dto.shortName !== undefined) d.shortName = dto.shortName;
    if (dto.typeLabel !== undefined) d.typeLabel = dto.typeLabel;
    if (dto.bedType !== undefined) d.bedType = dto.bedType;
    if (dto.bedPreferences !== undefined) d.bedPreferences = dto.bedPreferences;
    if (dto.areaMode !== undefined) d.areaMode = dto.areaMode;
    if (dto.areaSqm !== undefined) d.areaSqm = dto.areaSqm;
    if (dto.areaSqmTo !== undefined) d.areaSqmTo = dto.areaSqmTo;
    if (dto.roomsInUnit !== undefined) d.roomsInUnit = dto.roomsInUnit;
    if (dto.mainPlaces !== undefined) d.mainPlaces = dto.mainPlaces;
    if (dto.extraPlaces !== undefined) d.extraPlaces = dto.extraPlaces;
    if (dto.securityDeposit !== undefined) d.securityDeposit = dto.securityDeposit;
    if (dto.description !== undefined) d.description = dto.description;
    if (dto.amenities !== undefined) d.amenities = dto.amenities;
    if (dto.views !== undefined) d.views = dto.views;
    if (dto.bedPreference !== undefined) d.bedPreference = dto.bedPreference;
    if (dto.viewPreference !== undefined) d.viewPreference = dto.viewPreference;
    if (dto.priorityAmenities !== undefined) d.priorityAmenities = dto.priorityAmenities.slice(0, 5);
    if (dto.photos !== undefined) d.photos = dto.photos;
    if (dto.videos !== undefined) d.videos = dto.videos;
    if (dto.address !== undefined) d.address = dto.address;
    if (dto.latitude !== undefined) d.latitude = dto.latitude;
    if (dto.longitude !== undefined) d.longitude = dto.longitude;
    if (dto.howToReach !== undefined) d.howToReach = dto.howToReach;
    if (dto.confirmationFileUrl !== undefined) d.confirmationFileUrl = dto.confirmationFileUrl;
    if (dto.showInBooking !== undefined) d.showInBooking = dto.showInBooking;
    if (dto.showInOta !== undefined) d.showInOta = dto.showInOta;
    if (dto.active !== undefined) d.active = dto.active;
    return d;
  }

  /** Вместимость = основные + доп. места (или явная 1). */
  private capacityOf(dto: CreateRoomTypeDto): number {
    const main = dto.mainPlaces ?? 1;
    const extra = dto.extraPlaces ?? 0;
    return Math.max(1, main + extra);
  }
}
