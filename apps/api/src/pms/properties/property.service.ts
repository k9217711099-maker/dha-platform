import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyKind, PropertyType, District } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';

/** Данные создания/редактирования объекта размещения (полная карточка, §12). */
export interface PropertyInput {
  name?: string;
  kind?: PropertyKind;
  type?: PropertyType;
  district?: District | null;
  city?: string;
  address?: string;
  description?: string | null;
  amenities?: string[];
  features?: string[];
  photos?: string[];
  latitude?: number | null;
  longitude?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  wifiName?: string | null;
  wifiPassword?: string | null;
  houseRules?: string | null;
  instructions?: string | null;
  securityDeposit?: number | null;
  /// Автозаезд воронки заселения (CHECK-IN-TZ §6.3).
  autoCheckin?: boolean;
  /// Режим апартаментов: инструкция по заселению у каждого номера своя.
  perRoomInstructions?: boolean;
  active?: boolean;
}

/** Тип юнита по умолчанию под тип объекта (поле type — легаси-категория гостевого каталога). */
const DEFAULT_TYPE: Record<PropertyKind, PropertyType> = {
  HOTEL: PropertyType.HOTEL,
  MINI_HOTEL: PropertyType.BOUTIQUE_HOTEL,
  APARTMENT: PropertyType.STUDIO,
};

/** Объекты размещения (отели/апартаменты) — верхний уровень: Объект → Категория → Номер. */
@Injectable()
export class PropertyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.property.findMany({
      where: { tenantId },
      include: { _count: { select: { roomTypes: true, rooms: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.property.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Объект не найден');
    return p;
  }

  async create(tenantId: string, dto: PropertyInput, actorId?: string) {
    const kind = dto.kind ?? PropertyKind.APARTMENT;
    const property = await this.prisma.property.create({
      data: {
        tenantId,
        name: dto.name?.trim() || 'Новый объект',
        kind,
        type: dto.type ?? DEFAULT_TYPE[kind],
        district: dto.district ?? null,
        city: dto.city?.trim() || 'Санкт-Петербург',
        address: dto.address?.trim() || '',
        description: dto.description ?? null,
        amenities: dto.amenities ?? [],
        features: dto.features ?? [],
        photos: dto.photos ?? [],
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        checkInTime: dto.checkInTime ?? null,
        checkOutTime: dto.checkOutTime ?? null,
        wifiName: dto.wifiName ?? null,
        wifiPassword: dto.wifiPassword ?? null,
        houseRules: dto.houseRules ?? null,
        instructions: dto.instructions ?? null,
        securityDeposit: dto.securityDeposit ?? null,
        autoCheckin: dto.autoCheckin ?? false,
        perRoomInstructions: dto.perRoomInstructions ?? false,
        active: dto.active ?? true,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'Property', entityId: property.id, payload: { name: property.name, kind: property.kind } });
    return property;
  }

  async update(tenantId: string, id: string, dto: PropertyInput, actorId?: string) {
    const existing = await this.prisma.property.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Объект не найден');
    const data: Prisma.PropertyUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.district !== undefined) data.district = dto.district;
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.address !== undefined) data.address = dto.address.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.amenities !== undefined) data.amenities = dto.amenities;
    if (dto.features !== undefined) data.features = dto.features;
    if (dto.photos !== undefined) data.photos = dto.photos;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.checkInTime !== undefined) data.checkInTime = dto.checkInTime;
    if (dto.checkOutTime !== undefined) data.checkOutTime = dto.checkOutTime;
    if (dto.wifiName !== undefined) data.wifiName = dto.wifiName;
    if (dto.wifiPassword !== undefined) data.wifiPassword = dto.wifiPassword;
    if (dto.houseRules !== undefined) data.houseRules = dto.houseRules;
    if (dto.instructions !== undefined) data.instructions = dto.instructions;
    if (dto.securityDeposit !== undefined) data.securityDeposit = dto.securityDeposit;
    if (dto.autoCheckin !== undefined) data.autoCheckin = dto.autoCheckin;
    if (dto.perRoomInstructions !== undefined) data.perRoomInstructions = dto.perRoomInstructions;
    if (dto.active !== undefined) data.active = dto.active;
    const property = await this.prisma.property.update({ where: { id }, data });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'Property', entityId: id, payload: { name: property.name } });
    return property;
  }

  /**
   * Удалить объект. Запрещено, если есть бронирования (иначе каскад удалил бы и их).
   * Категории, номера и замки объекта удаляются каскадом (onDelete: Cascade).
   */
  async remove(tenantId: string, id: string, actorId?: string) {
    const existing = await this.prisma.property.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Объект не найден');
    const bookings = await this.prisma.booking.count({ where: { propertyId: id } });
    if (bookings > 0) {
      throw new BadRequestException(
        `У объекта есть бронирования (${bookings}). Удаление запрещено — скройте объект (снимите «Активен») вместо удаления.`,
      );
    }
    await this.prisma.property.delete({ where: { id } });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'Property', entityId: id, payload: { name: existing.name } });
    return { ok: true };
  }
}
