import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AvitoPollService } from './avito-poll.service.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { AvitoHttpClient } from './avito-http.client.js';
import { ChannelIngestionService } from '../../channel-ingestion.service.js';
import { ChannelAdapterRegistry } from '../channel-adapter.registry.js';

const creds = { provider: 'avito', clientId: 'cid', clientSecret: 'sec', userId: 355873322 };

function setup(bookings: any[], known = false) {
  const prisma = {
    channel: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', code: 'avito', active: true, credentials: creds }) },
    channelRoomTypeMapping: { findMany: vi.fn().mockResolvedValue([{ remoteRoomTypeId: '8071', roomTypeId: 'rt1' }]) },
    channelBooking: { findUnique: vi.fn().mockResolvedValue(known ? { id: 'cb1' } : null) },
  } as unknown as PrismaService;
  const http = { getBookings: vi.fn().mockResolvedValue(bookings) } as unknown as AvitoHttpClient;
  const ingestion = {
    ingestBooking: vi.fn().mockResolvedValue({ booking: { id: 'b1' } }),
    ingestCancellation: vi.fn().mockResolvedValue({}),
  } as unknown as ChannelIngestionService;
  const registry = { providerOf: vi.fn().mockReturnValue('avito') } as unknown as ChannelAdapterRegistry;
  const service = new AvitoPollService(prisma, http, ingestion, registry);
  return { service, prisma, http, ingestion };
}

const activeBooking = { avito_booking_id: '2784166209049096851', item_id: '8071', check_in: '2026-08-01', check_out: '2026-08-03', status: 'active' };
const canceledBooking = { ...activeBooking, status: 'canceled' };

beforeEach(() => vi.clearAllMocks());

describe('AvitoPollService.pollChannel', () => {
  it('активная бронь → ingestBooking с внедрённым item_id/account_id', async () => {
    const { service, ingestion } = setup([activeBooking]);
    const res = await service.pollChannel('c1');
    expect(res).toMatchObject({ items: 1, fetched: 1, ingested: 1 });
    const [, raw] = vi.mocked(ingestion.ingestBooking).mock.calls[0];
    expect(raw).toMatchObject({ item_id: '8071', account_id: '355873322' });
  });

  it('отмена по известной броне → ingestCancellation', async () => {
    const { service, ingestion } = setup([canceledBooking], true);
    const res = await service.pollChannel('c1');
    expect(ingestion.ingestCancellation).toHaveBeenCalled();
    expect(res.cancelled).toBe(1);
  });

  it('отмена по НЕизвестной броне → пропускаем (не создаём/не отменяем)', async () => {
    const { service, ingestion } = setup([canceledBooking], false);
    const res = await service.pollChannel('c1');
    expect(ingestion.ingestCancellation).not.toHaveBeenCalled();
    expect(res.cancelled).toBe(0);
  });

  it('дубль → duplicates, конфликт → conflicts', async () => {
    const { service, ingestion } = setup([activeBooking]);
    vi.mocked(ingestion.ingestBooking).mockResolvedValueOnce({ duplicate: true, channelBooking: {} } as never);
    const res = await service.pollChannel('c1');
    expect(res).toMatchObject({ duplicates: 1, ingested: 0 });
  });

  it('нет clientId/userId в credentials → ошибка', async () => {
    const { service, prisma } = setup([]);
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({ id: 'c1', code: 'avito', active: true, credentials: { provider: 'avito' } } as never);
    await expect(service.pollChannel('c1')).rejects.toThrow();
  });
});
