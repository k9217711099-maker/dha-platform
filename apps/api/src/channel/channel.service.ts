import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SyncJobStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import type { CreateChannelDto, MappingKind, SetMappingDto, UpdateChannelDto } from './dto/channel.dto.js';

/** Каналы продаж и маппинги (DHP Channel Manager §3–4). Всё в контексте арендатора. */
@Injectable()
export class ChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    return this.prisma.channel.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async get(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, tenantId },
      include: { propertyMappings: true, roomTypeMappings: true, ratePlanMappings: true },
    });
    if (!channel) throw new NotFoundException('Канал не найден');
    return channel;
  }

  async create(tenantId: string, dto: CreateChannelDto, actorId?: string) {
    const exists = await this.prisma.channel.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } });
    if (exists) throw new BadRequestException('Канал с таким кодом уже существует');
    const channel = await this.prisma.channel.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        kind: dto.kind ?? 'OTA',
        status: dto.credentials ? 'CONNECTED' : 'DISCONNECTED',
        credentials: (dto.credentials ?? undefined) as Prisma.InputJsonValue | undefined,
        active: dto.active ?? true,
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'Channel', entityId: channel.id, payload: { code: channel.code } });
    return channel;
  }

  async update(tenantId: string, id: string, dto: UpdateChannelDto, actorId?: string) {
    await this.get(tenantId, id);
    const data: Prisma.ChannelUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.credentials !== undefined) data.credentials = dto.credentials as Prisma.InputJsonValue;
    const channel = await this.prisma.channel.update({ where: { id }, data });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'Channel', entityId: id, payload: { ...dto, credentials: dto.credentials ? '***' : undefined } });
    return channel;
  }

  // ─── Маппинги ───
  async setMapping(tenantId: string, channelId: string, kind: MappingKind, dto: SetMappingDto, actorId?: string) {
    await this.get(tenantId, channelId);
    if (kind === 'property') {
      await this.prisma.channelPropertyMapping.upsert({
        where: { channelId_propertyId: { channelId, propertyId: dto.localId } },
        create: { tenantId, channelId, propertyId: dto.localId, remotePropertyId: dto.remoteId },
        update: { remotePropertyId: dto.remoteId },
      });
    } else if (kind === 'room-type') {
      await this.prisma.channelRoomTypeMapping.upsert({
        where: { channelId_roomTypeId: { channelId, roomTypeId: dto.localId } },
        create: { tenantId, channelId, roomTypeId: dto.localId, remoteRoomTypeId: dto.remoteId },
        update: { remoteRoomTypeId: dto.remoteId },
      });
    } else {
      await this.prisma.channelRatePlanMapping.upsert({
        where: { channelId_ratePlanId: { channelId, ratePlanId: dto.localId } },
        create: { tenantId, channelId, ratePlanId: dto.localId, remoteRatePlanId: dto.remoteId },
        update: { remoteRatePlanId: dto.remoteId },
      });
    }
    await this.audit.record({ tenantId, actorId, action: 'mapping_set', entity: 'Channel', entityId: channelId, payload: { kind, ...dto } });
    return this.listMappings(tenantId, channelId);
  }

  async listMappings(tenantId: string, channelId: string) {
    await this.get(tenantId, channelId);
    const [property, roomType, ratePlan] = await Promise.all([
      this.prisma.channelPropertyMapping.findMany({ where: { channelId } }),
      this.prisma.channelRoomTypeMapping.findMany({ where: { channelId } }),
      this.prisma.channelRatePlanMapping.findMany({ where: { channelId } }),
    ]);
    return { property, roomType, ratePlan };
  }

  // ─── Мониторинг (DHP Adapter §11) ───
  async monitoring(tenantId: string, channelId: string) {
    const channel = await this.get(tenantId, channelId);
    const grouped = await this.prisma.channelSyncJob.groupBy({ by: ['status'], where: { channelId }, _count: true });
    const jobs = Object.fromEntries(grouped.map((g) => [g.status, g._count])) as Partial<Record<SyncJobStatus, number>>;
    const [lastBooking, recentLogs] = await Promise.all([
      this.prisma.channelBooking.findFirst({ where: { channelId }, orderBy: { createdAt: 'desc' }, select: { externalBookingId: true, status: true, createdAt: true } }),
      this.prisma.channelSyncLog.findMany({ where: { channelId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const provider = ((channel.credentials as { provider?: string } | null)?.provider ?? channel.code).toLowerCase();
    return {
      id: channel.id,
      code: channel.code,
      name: channel.name,
      provider,
      status: channel.status,
      active: channel.active,
      lastSyncAt: channel.lastSyncAt,
      lastBookingAt: channel.lastBookingAt,
      jobs: {
        pending: jobs.PENDING ?? 0,
        processing: jobs.PROCESSING ?? 0,
        success: jobs.SUCCESS ?? 0,
        failed: jobs.FAILED ?? 0,
        retryScheduled: jobs.RETRY_SCHEDULED ?? 0,
        deadLetter: jobs.DEAD_LETTER ?? 0,
      },
      lastBooking,
      recentLogs,
    };
  }

  listSyncJobs(tenantId: string, channelId: string) {
    return this.prisma.channelSyncJob.findMany({ where: { tenantId, channelId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  listLogs(tenantId: string, channelId: string) {
    return this.prisma.channelSyncLog.findMany({ where: { tenantId, channelId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
