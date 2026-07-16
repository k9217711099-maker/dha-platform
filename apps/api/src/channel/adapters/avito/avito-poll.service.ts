import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { ChannelIngestionService } from '../../channel-ingestion.service.js';
import { ChannelAdapterRegistry } from '../channel-adapter.registry.js';
import { AvitoChannelAdapter } from './avito-channel.adapter.js';
import { AvitoHttpClient } from './avito-http.client.js';
import { AvitoBooking, AvitoCredentials, AvitoItem } from './avito.types.js';

/** Насколько вперёд тянем брони Avito (date_start обязан быть сегодня/в будущем). */
const POLL_WINDOW_DAYS = 365;

export interface AvitoPollResult {
  channelId: string;
  items: number;
  fetched: number;
  ingested: number;
  cancelled: number;
  conflicts: number;
  duplicates: number;
  errors: number;
}

/**
 * Входящий поллинг броней Avito. Для каждого активного avito-канала обходит замапленные
 * объявления (item = категория/квартира), тянет брони на окно и заводит их в PMS через
 * ChannelIngestionService (тот же анти-овербукинг, дедуп по channelBooking). Avito отдаёт
 * брони поллингом, вебхука на брони нет. Чтение из Avito боевые объявления не изменяет.
 */
@Injectable()
export class AvitoPollService {
  private readonly logger = new Logger(AvitoPollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: AvitoHttpClient,
    private readonly ingestion: ChannelIngestionService,
    private readonly registry: ChannelAdapterRegistry,
  ) {}

  /** Опросить все активные avito-каналы (планировщик). */
  async pollAll(): Promise<AvitoPollResult[]> {
    const channels = await this.prisma.channel.findMany({ where: { active: true } });
    const avito = channels.filter((c) => this.registry.providerOf({ code: c.code, credentials: c.credentials as Record<string, unknown> | null }) === 'avito');
    const results: AvitoPollResult[] = [];
    for (const c of avito) {
      try {
        results.push(await this.pollChannel(c.id));
      } catch (err) {
        this.logger.error(`Поллинг Avito-канала ${c.code} не удался: ${(err as Error).message}`);
      }
    }
    return results;
  }

  /** Объявления аккаунта Avito + отметка, какие уже сматчены (для маппинг-UI). */
  async listItems(channelId: string): Promise<Array<AvitoItem & { mappedRoomTypeId: string | null }>> {
    const { creds } = await this.requireAvitoChannel(channelId, false);
    const [items, mappings] = await Promise.all([
      this.http.getItems(creds),
      this.prisma.channelRoomTypeMapping.findMany({ where: { channelId } }),
    ]);
    const byRemote = new Map(mappings.map((m) => [m.remoteRoomTypeId, m.roomTypeId]));
    return items.map((it) => ({ ...it, mappedRoomTypeId: byRemote.get(String(it.id)) ?? null }));
  }

  /** Опросить конкретный канал (ручной запуск из админки/скрипта). */
  async pollChannel(channelId: string): Promise<AvitoPollResult> {
    const { channel, creds } = await this.requireAvitoChannel(channelId);

    const mappings = await this.prisma.channelRoomTypeMapping.findMany({ where: { channelId } });
    const { from, to } = this.window();
    const res: AvitoPollResult = { channelId, items: mappings.length, fetched: 0, ingested: 0, cancelled: 0, conflicts: 0, duplicates: 0, errors: 0 };

    for (const m of mappings) {
      let bookings: AvitoBooking[];
      try {
        bookings = await this.http.getBookings(creds, m.remoteRoomTypeId, from, to);
      } catch (err) {
        res.errors += 1;
        this.logger.warn(`Avito item ${m.remoteRoomTypeId}: не удалось получить брони — ${(err as Error).message}`);
        continue;
      }
      res.fetched += bookings.length;
      for (const b of bookings) {
        await this.route(channelId, creds.userId, m.remoteRoomTypeId, b, res);
      }
    }
    this.logger.log(`Avito ${channel.code}: объявлений ${res.items}, броней ${res.fetched} (заведено ${res.ingested}, отмен ${res.cancelled}, конфликтов ${res.conflicts}, дублей ${res.duplicates}, ошибок ${res.errors})`);
    return res;
  }

  /** Маршрутизация одной брони Avito в ingest/cancel с внедрением item_id/account_id. */
  private async route(channelId: string, accountId: number, itemId: string, booking: AvitoBooking, res: AvitoPollResult): Promise<void> {
    const raw = { ...booking, item_id: itemId, account_id: String(accountId) };
    try {
      if (AvitoChannelAdapter.isCanceled(booking.status)) {
        // Отменяем только если бронь ранее заводилась (иначе Avito-отмена нам не интересна).
        const known = await this.prisma.channelBooking.findUnique({
          where: { channelId_externalBookingId: { channelId, externalBookingId: booking.avito_booking_id } },
        });
        if (known) {
          await this.ingestion.ingestCancellation(channelId, raw);
          res.cancelled += 1;
        }
        return;
      }
      const out = await this.ingestion.ingestBooking(channelId, raw);
      if ('duplicate' in out && out.duplicate) res.duplicates += 1;
      else if ('conflict' in out && out.conflict) res.conflicts += 1;
      else res.ingested += 1;
    } catch (err) {
      res.errors += 1;
      this.logger.warn(`Avito бронь ${booking.avito_booking_id}: не удалось обработать — ${(err as Error).message}`);
    }
  }

  private window(): { from: string; to: string } {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(now), to: iso(new Date(now.getTime() + POLL_WINDOW_DAYS * 86_400_000)) };
  }

  /** Канал + валидные Avito-креды. requireUserId=false, когда userId для операции не обязателен. */
  private async requireAvitoChannel(channelId: string, requireUserId = true) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Канал не найден');
    const creds = channel.credentials as AvitoCredentials | null;
    if (!creds?.clientId || !creds?.clientSecret || (requireUserId && !creds?.userId)) {
      throw new NotFoundException('У канала Avito не заданы clientId/clientSecret/userId в credentials');
    }
    return { channel, creds };
  }
}
