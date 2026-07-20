import { Injectable } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { SettingsService } from '../../common/settings/settings.service.js';

/**
 * Каналы с тумблерами «канал вкл/выкл» и «AI вкл/выкл» в админке. web/app работают
 * из коробки (виджет/экран приложения) и всегда включены — их тут нет.
 */
export const TOGGLEABLE_CHANNELS = [
  'telegram',
  'tg_direct',
  'max',
  'whatsapp',
  'umnico',
  'email',
  'avito',
] as const;
export type ToggleChannelId = (typeof TOGGLEABLE_CHANNELS)[number];

/**
 * Значение по умолчанию для тумблера «канал включён», если его не трогали. Уже
 * настроенные (telegram/umnico/email) включены; требующие отдельного подключения
 * (max/tg_direct/whatsapp) и заготовки (avito) — выключены.
 */
const DEFAULT_ENABLED: Record<ToggleChannelId, boolean> = {
  telegram: true,
  tg_direct: false,
  max: false,
  whatsapp: false,
  umnico: true,
  email: true,
  avito: false,
};

/** AiChannel (enum БД) → id переключаемого канала. web/app всегда вкл — их тут нет. */
const CHANNEL_TO_ID: Partial<Record<AiChannel, ToggleChannelId>> = {
  [AiChannel.TELEGRAM]: 'telegram',
  [AiChannel.TELEGRAM_DIRECT]: 'tg_direct',
  [AiChannel.MAX]: 'max',
  [AiChannel.WHATSAPP]: 'whatsapp',
  [AiChannel.UMNICO]: 'umnico',
};

/**
 * Вкл/выкл каналов гостевого AI-агента из админки + вкл/выкл AI по каждому каналу.
 * Флаги в Setting: `ai.channel.<id>.enabled` (канал), `ai.channel.<id>.ai_enabled` (AI
 * на этом канале), `ai.agent.enabled` (глобальный мастер-тумблер AI). Единый источник
 * правды — серверные сервисы (polling/сокеты/вебхуки) и гостевой агент сверяются с ним.
 */
@Injectable()
export class ChannelToggleService {
  constructor(private readonly settings: SettingsService) {}

  static key(id: ToggleChannelId): string {
    return `ai.channel.${id}.enabled`;
  }
  static aiKey(id: ToggleChannelId): string {
    return `ai.channel.${id}.ai_enabled`;
  }

  private async flag(key: string, def: boolean): Promise<boolean> {
    const v = await this.settings.get(key);
    if (v === null || v === undefined || v === '') return def;
    return v === 'true';
  }

  // ── Канал вкл/выкл ────────────────────────────────────────────────────────
  async isEnabled(id: ToggleChannelId): Promise<boolean> {
    return this.flag(ChannelToggleService.key(id), DEFAULT_ENABLED[id]);
  }
  async setEnabled(id: ToggleChannelId, on: boolean): Promise<void> {
    await this.settings.set(ChannelToggleService.key(id), on ? 'true' : 'false');
  }

  // ── AI по каналу вкл/выкл (по умолчанию включён) ──────────────────────────
  async isChannelAiEnabled(id: ToggleChannelId): Promise<boolean> {
    return this.flag(ChannelToggleService.aiKey(id), true);
  }
  async setChannelAi(id: ToggleChannelId, on: boolean): Promise<void> {
    await this.settings.set(ChannelToggleService.aiKey(id), on ? 'true' : 'false');
  }

  // ── Глобальный мастер-тумблер AI ──────────────────────────────────────────
  async isAiEnabled(): Promise<boolean> {
    return this.flag('ai.agent.enabled', true);
  }
  async setAiEnabled(on: boolean): Promise<void> {
    await this.settings.set('ai.agent.enabled', on ? 'true' : 'false');
  }

  /**
   * Должен ли БОТ отвечать на данном канале: глобальный AI включён И AI по каналу включён.
   * (Сам канал при этом обычно включён — иначе входящее вообще не дойдёт.) Принимает
   * AiChannel enum; для ADMIN/неизвестных — по глобальному флагу.
   */
  async isAiEnabledFor(channel: AiChannel): Promise<boolean> {
    if (!(await this.isAiEnabled())) return false;
    const id = CHANNEL_TO_ID[channel];
    return id ? this.isChannelAiEnabled(id) : true;
  }

  /** Включён ли канал по AiChannel enum (для гейтов вебхуков/поллинга). */
  async isChannelEnabledFor(channel: AiChannel): Promise<boolean> {
    const id = CHANNEL_TO_ID[channel];
    return id ? this.isEnabled(id) : true;
  }

  /** Карты включённости каналов и AI-по-каналу — для списка в админке. */
  async map(): Promise<Record<ToggleChannelId, boolean>> {
    const entries = await Promise.all(
      TOGGLEABLE_CHANNELS.map(async (id) => [id, await this.isEnabled(id)] as const),
    );
    return Object.fromEntries(entries) as Record<ToggleChannelId, boolean>;
  }
  async aiMap(): Promise<Record<ToggleChannelId, boolean>> {
    const entries = await Promise.all(
      TOGGLEABLE_CHANNELS.map(async (id) => [id, await this.isChannelAiEnabled(id)] as const),
    );
    return Object.fromEntries(entries) as Record<ToggleChannelId, boolean>;
  }
}
