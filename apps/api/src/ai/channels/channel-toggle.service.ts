import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../common/settings/settings.service.js';

/** Каналы с переключателем вкл/выкл (web/app работают из коробки, без тумблера). */
export const TOGGLEABLE_CHANNELS = ['telegram', 'tg_direct', 'max', 'whatsapp'] as const;
export type ToggleChannelId = (typeof TOGGLEABLE_CHANNELS)[number];

/**
 * Значение по умолчанию, если тумблер ещё не трогали. Telegram-бот исторически
 * включён; MAX по решению выключен; WhatsApp/Telegram Direct — выключены до
 * явного включения из админки.
 */
const DEFAULT_ENABLED: Record<ToggleChannelId, boolean> = {
  telegram: true,
  tg_direct: false,
  max: false,
  whatsapp: false,
};

/**
 * Включение/выключение каналов гостевого AI-агента из админки. Флаг хранится в
 * Setting (`ai.channel.<id>.enabled`) — единый источник правды; серверные сервисы
 * (polling/сокеты) сверяются с ним. Заменяет прежние env-гейты WA_ENABLED /
 * TG_USERBOT_ENABLED — теперь всё переключается тумблером без правки .env.
 */
@Injectable()
export class ChannelToggleService {
  constructor(private readonly settings: SettingsService) {}

  static key(id: ToggleChannelId): string {
    return `ai.channel.${id}.enabled`;
  }

  async isEnabled(id: ToggleChannelId): Promise<boolean> {
    const v = await this.settings.get(ChannelToggleService.key(id));
    if (v === null || v === undefined || v === '') return DEFAULT_ENABLED[id];
    return v === 'true';
  }

  async setEnabled(id: ToggleChannelId, on: boolean): Promise<void> {
    await this.settings.set(ChannelToggleService.key(id), on ? 'true' : 'false');
  }

  /** Глобальный тумблер AI-агента: отвечает ли модель автоматически (по умолчанию да). */
  async isAiEnabled(): Promise<boolean> {
    const v = await this.settings.get('ai.agent.enabled');
    return v === null || v === undefined || v === '' ? true : v === 'true';
  }

  async setAiEnabled(on: boolean): Promise<void> {
    await this.settings.set('ai.agent.enabled', on ? 'true' : 'false');
  }

  /** Карта включённости всех переключаемых каналов — для списка в админке. */
  async map(): Promise<Record<ToggleChannelId, boolean>> {
    const entries = await Promise.all(
      TOGGLEABLE_CHANNELS.map(async (id) => [id, await this.isEnabled(id)] as const),
    );
    return Object.fromEntries(entries) as Record<ToggleChannelId, boolean>;
  }
}
