import { Injectable } from '@nestjs/common';
import { ChannelAdapter } from './channel-adapter.port.js';
import { MockChannelAdapter } from './mock-channel.adapter.js';
import { AvitoChannelAdapter } from './avito/avito-channel.adapter.js';

/** Минимум данных канала для выбора адаптера (credentials — сырой Json из Prisma). */
export interface ChannelDescriptor {
  code: string;
  credentials: unknown;
}

/**
 * Резолвер адаптеров каналов. Новый OTA = регистрация реализации ChannelAdapter здесь,
 * ядро (sync/ingestion) работает через порт. Провайдер берётся из credentials.provider,
 * иначе — из кода канала. Неизвестный провайдер → mock (dev/тесты).
 */
@Injectable()
export class ChannelAdapterRegistry {
  constructor(
    private readonly mock: MockChannelAdapter,
    private readonly avito: AvitoChannelAdapter,
  ) {}

  resolve(channel: ChannelDescriptor): ChannelAdapter {
    switch (this.providerOf(channel)) {
      case 'avito':
        return this.avito;
      default:
        return this.mock;
    }
  }

  /** Нормализованный код провайдера канала. */
  providerOf(channel: ChannelDescriptor): string {
    const creds = channel.credentials && typeof channel.credentials === 'object' ? (channel.credentials as Record<string, unknown>) : null;
    const fromCreds = typeof creds?.provider === 'string' ? creds.provider.toLowerCase() : undefined;
    return (fromCreds || channel.code || '').toLowerCase();
  }
}
