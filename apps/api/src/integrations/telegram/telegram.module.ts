import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { TelegramPort, type OutgoingMedia } from './telegram.port.js';
import { MockTelegramAdapter } from './mock-telegram.adapter.js';
import { HttpTelegramAdapter } from './http-telegram.adapter.js';
import { TelegramConfigService } from './telegram-config.service.js';

/**
 * Диспетчер TelegramPort: маршрутизирует каждое сообщение в реальный Bot API,
 * если задан токен (в админке через Setting или в env) ИЛИ TELEGRAM_PROVIDER=http;
 * иначе — в mock (лог). Это позволяет включить канал, просто введя токен в
 * админке, без правки .env и перезапуска.
 */
@Injectable()
export class TelegramDispatchAdapter extends TelegramPort {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly cfg: TelegramConfigService,
    private readonly http: HttpTelegramAdapter,
    private readonly mock: MockTelegramAdapter,
  ) {
    super();
  }

  private async useHttp(): Promise<boolean> {
    return (
      this.config.get('TELEGRAM_PROVIDER', { infer: true }) === 'http' || (await this.cfg.hasToken())
    );
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    return ((await this.useHttp()) ? this.http : this.mock).sendMessage(chatId, text);
  }

  async sendMedia(chatId: number | string, media: OutgoingMedia): Promise<void> {
    return ((await this.useHttp()) ? this.http : this.mock).sendMedia(chatId, media);
  }
}

/** Реализация TelegramPort — рантайм-диспетчер (см. TelegramDispatchAdapter). */
@Global()
@Module({
  providers: [
    TelegramConfigService,
    MockTelegramAdapter,
    HttpTelegramAdapter,
    { provide: TelegramPort, useClass: TelegramDispatchAdapter },
  ],
  exports: [TelegramPort, TelegramConfigService],
})
export class TelegramModule {}
