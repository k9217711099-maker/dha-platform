import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvailabilityService } from './availability.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';

function setup() {
  const prisma = {
    roomType: { findMany: vi.fn() },
    room: { findMany: vi.fn() },
    booking: { findMany: vi.fn() },
    inventoryLock: { findMany: vi.fn() },
    roomBlock: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  const service = new AvailabilityService(prisma, audit);
  return { service, prisma, audit };
}

const Q = { propertyId: 'p1', checkIn: '2026-08-01', checkOut: '2026-08-05' } as const;
const full = { checkIn: new Date('2026-08-01T00:00:00Z'), checkOut: new Date('2026-08-05T00:00:00Z') };

describe('AvailabilityService.search — формула Available = Total − Bookings − Locks − Blocks', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockCatalog(prisma: PrismaService, rooms: { id: string; roomTypeId: string }[]) {
    vi.mocked(prisma.roomType.findMany).mockResolvedValue([
      { id: 'rt1', name: 'Студия', capacity: 2, property: { id: 'p1', name: 'Объект' } },
    ] as never);
    vi.mocked(prisma.room.findMany).mockResolvedValue(rooms as never);
  }

  it('2 номера, 1 бронь → available 1', async () => {
    const { service, prisma } = setup();
    mockCatalog(prisma, [{ id: 'r1', roomTypeId: 'rt1' }, { id: 'r2', roomTypeId: 'rt1' }]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([{ roomTypeId: 'rt1', ...full }] as never);
    vi.mocked(prisma.inventoryLock.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.roomBlock.findMany).mockResolvedValue([] as never);

    const results = await service.search('t1', Q as never);
    expect(results[0]).toMatchObject({ totalRooms: 2, available: 1, nights: 4 });
  });

  it('активный лок уменьшает доступность', async () => {
    const { service, prisma } = setup();
    mockCatalog(prisma, [{ id: 'r1', roomTypeId: 'rt1' }, { id: 'r2', roomTypeId: 'rt1' }]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryLock.findMany).mockResolvedValue([{ roomTypeId: 'rt1', ...full, quantity: 1 }] as never);
    vi.mocked(prisma.roomBlock.findMany).mockResolvedValue([] as never);

    const results = await service.search('t1', Q as never);
    expect(results[0]?.available).toBe(1);
  });

  it('блокировка номера уменьшает доступность', async () => {
    const { service, prisma } = setup();
    mockCatalog(prisma, [{ id: 'r1', roomTypeId: 'rt1' }, { id: 'r2', roomTypeId: 'rt1' }]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.inventoryLock.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.roomBlock.findMany).mockResolvedValue([{ roomId: 'r1', from: full.checkIn, to: full.checkOut }] as never);

    const results = await service.search('t1', Q as never);
    expect(results[0]?.available).toBe(1);
  });

  it('всё занято (бронь+блок на 2 номера) → available 0', async () => {
    const { service, prisma } = setup();
    mockCatalog(prisma, [{ id: 'r1', roomTypeId: 'rt1' }, { id: 'r2', roomTypeId: 'rt1' }]);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([{ roomTypeId: 'rt1', ...full }] as never);
    vi.mocked(prisma.inventoryLock.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.roomBlock.findMany).mockResolvedValue([{ roomId: 'r2', from: full.checkIn, to: full.checkOut }] as never);

    const results = await service.search('t1', Q as never);
    expect(results[0]?.available).toBe(0);
  });
});

describe('AvailabilityService.assertAndLockForBooking — анти-овербукинг', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeTx() {
    return {
      $queryRaw: vi.fn(),
      booking: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      inventoryLock: { findMany: vi.fn().mockResolvedValue([]) },
      roomBlock: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    };
  }
  const asTx = (t: ReturnType<typeof makeTx>) => t as unknown as Prisma.TransactionClient;
  const params = { tenantId: 't1', propertyId: 'p1', roomTypeId: 'rt1', checkIn: '2026-08-01', checkOut: '2026-08-05' };

  it('категория распродана (1 номер, 1 бронь на весь период) → Conflict', async () => {
    const { service } = setup();
    const t = makeTx();
    t.$queryRaw.mockResolvedValue([{ id: 'r1' }]); // пул = 1 номер
    t.booking.findMany.mockResolvedValue([full]);
    await expect(service.assertAndLockForBooking(asTx(t), params)).rejects.toBeInstanceOf(ConflictException);
  });

  it('есть свободный номер в категории → проходит', async () => {
    const { service } = setup();
    const t = makeTx();
    t.$queryRaw.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]); // пул = 2
    t.booking.findMany.mockResolvedValue([full]); // занят 1
    await expect(service.assertAndLockForBooking(asTx(t), params)).resolves.toBeUndefined();
  });

  it('нет продаваемых номеров в категории → Conflict', async () => {
    const { service } = setup();
    const t = makeTx();
    t.$queryRaw.mockResolvedValue([]); // пустой пул
    await expect(service.assertAndLockForBooking(asTx(t), params)).rejects.toBeInstanceOf(ConflictException);
  });

  it('конкретный номер уже занят на даты → Conflict', async () => {
    const { service } = setup();
    const t = makeTx();
    t.$queryRaw.mockResolvedValue([{ id: 'r1', sell: 'SELLABLE', maint: 'OK', active: true }]);
    t.booking.findFirst.mockResolvedValue({ id: 'b-existing' });
    await expect(service.assertAndLockForBooking(asTx(t), { ...params, roomId: 'r1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('конкретный номер заблокирован на даты → Conflict', async () => {
    const { service } = setup();
    const t = makeTx();
    t.$queryRaw.mockResolvedValue([{ id: 'r1', sell: 'SELLABLE', maint: 'OK', active: true }]);
    t.roomBlock.findFirst.mockResolvedValue({ id: 'blk' });
    await expect(service.assertAndLockForBooking(asTx(t), { ...params, roomId: 'r1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('конкретный свободный номер (не занят, не заблокирован) → проходит', async () => {
    const { service } = setup();
    const t = makeTx();
    t.$queryRaw.mockResolvedValue([{ id: 'r1', sell: 'SELLABLE', maint: 'OK', active: true }]);
    await expect(service.assertAndLockForBooking(asTx(t), { ...params, roomId: 'r1' })).resolves.toBeUndefined();
  });
});

describe('AvailabilityService.autoAssignReadyRoom — автоназначение готового номера', () => {
  beforeEach(() => vi.clearAllMocks());

  const booking = {
    tenantId: 't1',
    roomTypeId: 'rt1',
    roomId: null as string | null,
    checkIn: new Date('2026-08-01T00:00:00Z'),
    checkOut: new Date('2026-08-05T00:00:00Z'),
  };

  function setupAuto(over: {
    booking?: unknown;
    pool?: { id: string }[];
    busyBookings?: { roomId: string }[];
    blocks?: { roomId: string }[];
  } = {}) {
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue(over.booking === undefined ? booking : over.booking),
        findMany: vi.fn().mockResolvedValue(over.busyBookings ?? []),
        update: vi.fn().mockResolvedValue({}),
      },
      roomBlock: { findMany: vi.fn().mockResolvedValue(over.blocks ?? []) },
      $queryRaw: vi.fn().mockResolvedValue(over.pool ?? []),
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation((cb: (t: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const audit = { record: vi.fn() } as unknown as AuditService;
    const service = new AvailabilityService(prisma, audit);
    return { service, tx, audit };
  }

  it('есть готовый свободный номер → назначает его и пишет аудит', async () => {
    const { service, tx, audit } = setupAuto({ pool: [{ id: 'r1' }, { id: 'r2' }] });
    await expect(service.autoAssignReadyRoom('b1')).resolves.toBe('r1');
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { roomId: 'r1' } });
    expect(audit.record).toHaveBeenCalled();
  });

  it('номер уже назначен → возвращает его, ничего не меняет', async () => {
    const { service, tx } = setupAuto({ booking: { ...booking, roomId: 'r9' } });
    await expect(service.autoAssignReadyRoom('b1')).resolves.toBe('r9');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('нет готовых номеров (пул пуст) → null', async () => {
    const { service, tx } = setupAuto({ pool: [] });
    await expect(service.autoAssignReadyRoom('b1')).resolves.toBeNull();
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('все готовые номера заняты бронью → null', async () => {
    const { service } = setupAuto({ pool: [{ id: 'r1' }], busyBookings: [{ roomId: 'r1' }] });
    await expect(service.autoAssignReadyRoom('b1')).resolves.toBeNull();
  });

  it('все готовые номера заблокированы → null', async () => {
    const { service } = setupAuto({ pool: [{ id: 'r1' }], blocks: [{ roomId: 'r1' }] });
    await expect(service.autoAssignReadyRoom('b1')).resolves.toBeNull();
  });

  it('первый занят, второй свободен → назначает второй', async () => {
    const { service, tx } = setupAuto({ pool: [{ id: 'r1' }, { id: 'r2' }], busyBookings: [{ roomId: 'r1' }] });
    await expect(service.autoAssignReadyRoom('b1')).resolves.toBe('r2');
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { roomId: 'r2' } });
  });
});
