import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoomService } from './room.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';

const TENANT = 't1';

function setup() {
  const prisma = {
    room: { findMany: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    property: { findFirst: vi.fn() },
    roomType: { findFirst: vi.fn() },
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  const service = new RoomService(prisma, audit);
  return { service, prisma, audit };
}

const dto = { propertyId: 'p1', roomTypeId: 'rt1', number: '101' };

describe('RoomService.create', () => {
  it('создаёт номер и пишет аудит с tenantId', async () => {
    const { service, prisma, audit } = setup();
    vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: 'p1' } as never);
    vi.mocked(prisma.roomType.findFirst).mockResolvedValue({ propertyId: 'p1' } as never);
    vi.mocked(prisma.room.create).mockResolvedValue({ id: 'r1', number: '101' } as never);

    const room = await service.create(TENANT, dto, 'admin1');

    expect(room).toEqual({ id: 'r1', number: '101' });
    // tenantId проставлен в создаваемую запись
    expect(vi.mocked(prisma.room.create).mock.calls[0]![0]).toMatchObject({ data: { tenantId: TENANT, number: '101' } });
    expect(vi.mocked(audit.record).mock.calls[0]![0]).toMatchObject({ tenantId: TENANT, action: 'created', entity: 'Room' });
  });

  it('отклоняет, если объект не в этом арендаторе', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.property.findFirst).mockResolvedValue(null);
    await expect(service.create(TENANT, dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет, если категория относится к другому объекту', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.property.findFirst).mockResolvedValue({ id: 'p1' } as never);
    vi.mocked(prisma.roomType.findFirst).mockResolvedValue({ propertyId: 'p2' } as never);
    await expect(service.create(TENANT, dto)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RoomService.get (tenant-скоуп)', () => {
  it('ищет строго в контексте tenantId', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.room.findFirst).mockResolvedValue({ id: 'r1' } as never);
    await service.get(TENANT, 'r1');
    expect(vi.mocked(prisma.room.findFirst).mock.calls[0]![0]).toMatchObject({ where: { id: 'r1', tenantId: TENANT } });
  });

  it('бросает NotFound, если номер не найден в арендаторе', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.room.findFirst).mockResolvedValue(null);
    await expect(service.get(TENANT, 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RoomService.setStatus', () => {
  it('требует хотя бы один статус', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.room.findFirst).mockResolvedValue({ id: 'r1' } as never);
    await expect(service.setStatus(TENANT, 'r1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('меняет статус и пишет аудит', async () => {
    const { service, prisma, audit } = setup();
    vi.mocked(prisma.room.findFirst).mockResolvedValue({ id: 'r1' } as never);
    vi.mocked(prisma.room.update).mockResolvedValue({ id: 'r1', maintenanceStatus: 'OUT_OF_ORDER' } as never);
    await service.setStatus(TENANT, 'r1', { maintenanceStatus: 'OUT_OF_ORDER' }, 'admin1');
    expect(vi.mocked(audit.record).mock.calls[0]![0]).toMatchObject({ action: 'status_changed', entity: 'Room', tenantId: TENANT });
  });
});

describe('RoomService.list', () => {
  it('фильтрует по tenantId и переданным фильтрам', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.room.findMany).mockResolvedValue([] as never);
    await service.list(TENANT, { propertyId: 'p1' });
    expect(vi.mocked(prisma.room.findMany).mock.calls[0]![0]).toMatchObject({ where: { tenantId: TENANT, propertyId: 'p1' } });
  });
});

beforeEach(() => vi.clearAllMocks());
