import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { withProxy } from '../../common/proxy/messenger-proxy.js';
import { TelegramConfigService } from '../../integrations/telegram/telegram-config.service.js';
import { TelegramAgentService, type TelegramUpdate } from './telegram-agent.service.js';
import { ChannelToggleService } from './channel-toggle.service.js';

interface RawUpdate extends TelegramUpdate {
  update_id: number;
}

/**
 * Long polling Telegram: сервер сам опрашивает getUpdates (через прокси), вместо
 * входящего вебхука. Нужно, когда Telegram заблокирован в ОБЕ стороны (РФ-сервер):
 * исходящее идёт через MESSENGER_PROXY_URL, а вебхук Telegram доставить не может.
 *
 * Включается, если TELEGRAM_MODE=polling ИЛИ (не webhook и задан MESSENGER_PROXY_URL).
 * Токен резолвится динамически (из админки), поэтому поллинг стартует и после ввода
 * токена — цикл ждёт его появления. Перед стартом снимает вебхук (getUpdates и
 * вебхук взаимоисключимы).
 */
@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TelegramPolling');
  private offset = 0;
  private stopped = false;
  private webhookCleared = false;

  constructor(
    private readonly cfg: TelegramConfigService,
    private readonly config: ConfigService<Env, true>,
    private readonly agent: TelegramAgentService,
    private readonly toggle: ChannelToggleService,
  ) {}

  onModuleInit(): void {
    const proxy = this.config.get('MESSENGER_PROXY_URL', { infer: true });
    const mode = this.config.get('TELEGRAM_MODE', { infer: true });
    const usePolling = mode === 'polling' || (mode !== 'webhook' && !!proxy);
    if (!usePolling) return;
    this.logger.log('Telegram long polling включён (опрос через прокси).');
    void this.loop();
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      if (!(await this.toggle.isEnabled('telegram'))) {
        await this.sleep(10_000); // бот выключен тумблером — не опрашиваем
        continue;
      }
      const { apiBase, botToken } = await this.cfg.resolve();
      const proxy = this.config.get('MESSENGER_PROXY_URL', { infer: true });
      if (!botToken) {
        this.webhookCleared = false; // токен могут поменять — при новом снова снимем вебхук
        await this.sleep(10_000);
        continue;
      }
      try {
        if (!this.webhookCleared) {
          await this.deleteWebhook(apiBase, botToken, proxy);
          this.webhookCleared = true;
        }
        const updates = await this.getUpdates(apiBase, botToken, proxy);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.agent.handleUpdate(u);
        }
      } catch (e) {
        const msg = (e as Error).message;
        // Вебхук всё ещё активен → снять и повторить.
        if (msg.includes('webhook')) this.webhookCleared = false;
        this.logger.warn(`Опрос Telegram: ${msg}`);
        await this.sleep(3_000);
      }
    }
  }

  private async getUpdates(apiBase: string, token: string, proxy?: string): Promise<RawUpdate[]> {
    const url = `${apiBase}/bot${token}/getUpdates?timeout=25&offset=${this.offset}`;
    // long poll держит соединение до 25 c — даём fetch запас в 35 c.
    const res = await fetch(url, withProxy({ signal: AbortSignal.timeout(35_000) }, proxy));
    const data = (await res.json()) as { ok: boolean; result?: RawUpdate[]; description?: string };
    if (!data.ok) throw new Error(data.description || `getUpdates HTTP ${res.status}`);
    return data.result ?? [];
  }

  private async deleteWebhook(apiBase: string, token: string, proxy?: string): Promise<void> {
    await fetch(`${apiBase}/bot${token}/deleteWebhook`, withProxy({ method: 'POST' }, proxy)).catch(
      () => null,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
