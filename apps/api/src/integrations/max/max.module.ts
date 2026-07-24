import { Global, Injectable, Module } from '@nestjs/common';
import { MaxPort, type MaxOutgoingMedia } from './max.port.js';
import { MockMaxAdapter } from './mock-max.adapter.js';
import { HttpMaxAdapter } from './http-max.adapter.js';
import { MaxConfigService } from './max-config.service.js';

/**
 * Диспетчер MaxPort: если задан токен MAX-бота (админка/env) — шлём в реальный
 * Bot API, иначе — mock (лог). Позволяет включить канал вводом токена в админке
 * без правки .env и перезапуска. По аналогии с TelegramModule.
 */
@Injectable()
export class MaxDispatchAdapter extends MaxPort {
  constructor(
    private readonly cfg: MaxConfigService,
    private readonly http: HttpMaxAdapter,
    private readonly mock: MockMaxAdapter,
  ) {
    super();
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    const useHttp = await this.cfg.hasToken();
    return (useHttp ? this.http : this.mock).sendMessage(chatId, text);
  }

  async sendMedia(chatId: number | string, media: MaxOutgoingMedia): Promise<void> {
    const useHttp = await this.cfg.hasToken();
    return (useHttp ? this.http : this.mock).sendMedia(chatId, media);
  }
}

/** Реализация MaxPort — рантайм-диспетчер (см. MaxDispatchAdapter). */
@Global()
@Module({
  providers: [
    MaxConfigService,
    MockMaxAdapter,
    HttpMaxAdapter,
    { provide: MaxPort, useClass: MaxDispatchAdapter },
  ],
  exports: [MaxPort, MaxConfigService],
})
export class MaxModule {}
