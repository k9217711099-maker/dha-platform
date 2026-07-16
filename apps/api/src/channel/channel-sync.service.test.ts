import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChannelSyncService } from './channel-sync.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AvailabilityService } from '../pms/availability/availability.service.js';
import { ChannelAdapterRegistry } from './adapters/channel-adapter.registry.js';

function setup() {
  const prisma = {
    channelSyncJob: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    channel: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', code: 'ost', active: true, credentials: null }), update: vi.fn().mockResolvedValue({}) },
    channelSyncLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const availability = { search: vi.fn().mockResolvedValue([]) } as unknown as AvailabilityService;
  const adapter = { pushAvailability: vi.fn(), pushRates: vi.fn(), pushRestrictions: vi.fn() };
  const registry = { resolve: vi.fn().mockReturnValue(adapter) } as unknown as ChannelAdapterRegistry;
  const service = new ChannelSyncService(prisma, availability, registry);
  return { service, prisma, availability, adapter };
}

const job = (over: Record<string, unknown> = {}) => ({ id: 'j1', tenantId: 't1', channelId: 'c1', jobType: 'AVAILABILITY', propertyId: 'p1', status: 'PENDING', payload: null, retryCount: 0, maxRetries: 3, ...over });
const finalStatus = (prisma: PrismaService) =>
  vi.mocked(prisma.channelSyncJob.update).mock.calls.map((c) => (c[0] as { data: { status: string } }).data).find((d) => ['SUCCESS', 'RETRY_SCHEDULED', 'DEAD_LETTER', 'CANCELLED'].includes(d.status));

beforeEach(() => vi.clearAllMocks());

describe('ChannelSyncService.processPending — очередь и ретраи', () => {
  it('успешная выгрузка → SUCCESS + lastSyncAt', async () => {
    const { service, prisma, adapter } = setup();
    vi.mocked(prisma.channelSyncJob.findMany).mockResolvedValue([job()] as never);
    vi.mocked(adapter.pushAvailability).mockResolvedValue({ ok: true, response: {} });
    const res = await service.processPending();
    expect(res).toMatchObject({ processed: 1, success: 1 });
    expect(finalStatus(prisma)?.status).toBe('SUCCESS');
    expect(prisma.channel.update).toHaveBeenCalled(); // lastSyncAt
  });

  it('ошибка (retryable, не исчерпаны попытки) → RETRY_SCHEDULED с nextRetryAt', async () => {
    const { service, prisma, adapter } = setup();
    vi.mocked(prisma.channelSyncJob.findMany).mockResolvedValue([job({ retryCount: 0, maxRetries: 3 })] as never);
    vi.mocked(adapter.pushAvailability).mockResolvedValue({ ok: false, errorCode: 'remote_server_error', retryable: true });
    await service.processPending();
    const f = finalStatus(prisma) as { status: string; retryCount: number; nextRetryAt: Date | null };
    expect(f.status).toBe('RETRY_SCHEDULED');
    expect(f.retryCount).toBe(1);
    expect(f.nextRetryAt).toBeInstanceOf(Date);
  });

  it('исчерпаны попытки → DEAD_LETTER без nextRetryAt', async () => {
    const { service, prisma, adapter } = setup();
    vi.mocked(prisma.channelSyncJob.findMany).mockResolvedValue([job({ retryCount: 2, maxRetries: 3 })] as never);
    vi.mocked(adapter.pushAvailability).mockResolvedValue({ ok: false, errorCode: 'remote_server_error', retryable: true });
    await service.processPending();
    const f = finalStatus(prisma) as { status: string; retryCount: number; nextRetryAt: Date | null };
    expect(f.status).toBe('DEAD_LETTER');
    expect(f.retryCount).toBe(3);
    expect(f.nextRetryAt).toBeNull();
  });

  it('нет готовых задач → ничего не обработано', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.channelSyncJob.findMany).mockResolvedValue([] as never);
    expect(await service.processPending()).toMatchObject({ processed: 0 });
  });
});
