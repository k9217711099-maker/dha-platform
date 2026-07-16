import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MaxConfigService } from '../../integrations/max/max-config.service.js';
import { MaxAgentService, type MaxUpdate } from './max-agent.service.js';
import { ChannelToggleService } from './channel-toggle.service.js';

interface RawUpdate extends MaxUpdate {
  timestamp?: number;
}

/**
 * Long polling MAX: сервер опрашивает GET /updates (marker-курсор), вместо
 * входящего вебхука. MAX доступен с РФ-сервера напрямую (прокси не нужен).
 * Включается при MAX_MODE=polling (по умолчанию) и заданном токене. Токен
 * резолвится динамически (из админки) — поллинг стартует и после ввода токена.
 */
@Injectable()
export class MaxPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MaxPolling');
  private marker: number | null = null;
  private stopped = false;

  constructor(
    private readonly cfg: MaxConfigService,
    private readonly config: ConfigService<Env, true>,
    private readonly agent: MaxAgentService,
    private readonly toggle: ChannelToggleService,
  ) {}

  onModuleInit(): void {
    if (this.config.get('MAX_MODE', { infer: true }) !== 'polling') return;
    this.logger.log('MAX long polling включён (GET /updates).');
    void this.loop();
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      if (!(await this.toggle.isEnabled('max'))) {
        await this.sleep(10_000); // канал выключен тумблером — не опрашиваем
        continue;
      }
      const { apiBase, botToken } = await this.cfg.resolve();
      if (!botToken) {
        await this.sleep(10_000); // токен ещё не задан в админке — ждём
        continue;
      }
      try {
        const { updates, marker } = await this.getUpdates(apiBase, botToken);
        for (const u of updates) await this.agent.handleUpdate(u);
        if (marker !== null && marker !== undefined) this.marker = marker;
      } catch (e) {
        this.logger.warn(`Опрос MAX: ${(e as Error).message}`);
        await this.sleep(3_000);
      }
    }
  }

  private async getUpdates(
    apiBase: string,
    token: string,
  ): Promise<{ updates: RawUpdate[]; marker: number | null }> {
    const q = new URLSearchParams({ timeout: '30', limit: '100' });
    if (this.marker !== null) q.set('marker', String(this.marker));
    // long poll держит соединение до 30 c — даём fetch запас в 40 c.
    const res = await fetch(`${apiBase}/updates?${q.toString()}`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(40_000),
    });
    const data = (await res.json()) as {
      updates?: RawUpdate[];
      marker?: number | null;
      message?: string;
    };
    if (!res.ok) throw new Error(data.message || `getUpdates HTTP ${res.status}`);
    return { updates: data.updates ?? [], marker: data.marker ?? null };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
