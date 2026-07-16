import { describe, it, expect, vi } from 'vitest';
import { ChannelToggleService } from './channel-toggle.service.js';
import type { SettingsService } from '../../common/settings/settings.service.js';

function make(stored: Record<string, string> = {}) {
  const settings = {
    get: vi.fn(async (k: string) => stored[k] ?? null),
    set: vi.fn(async (k: string, v: string) => { stored[k] = v; }),
  } as unknown as SettingsService;
  return { svc: new ChannelToggleService(settings), settings, stored };
}

describe('ChannelToggleService', () => {
  it('дефолты: telegram включён, max/whatsapp/tg_direct выключены', async () => {
    const { svc } = make();
    expect(await svc.isEnabled('telegram')).toBe(true);
    expect(await svc.isEnabled('max')).toBe(false);
    expect(await svc.isEnabled('whatsapp')).toBe(false);
    expect(await svc.isEnabled('tg_direct')).toBe(false);
  });

  it('setEnabled пишет в Setting и меняет значение', async () => {
    const { svc, stored } = make();
    await svc.setEnabled('max', true);
    expect(stored['ai.channel.max.enabled']).toBe('true');
    expect(await svc.isEnabled('max')).toBe(true);
    await svc.setEnabled('telegram', false);
    expect(await svc.isEnabled('telegram')).toBe(false);
  });

  it('map возвращает состояние всех переключаемых каналов', async () => {
    const { svc } = make({ 'ai.channel.whatsapp.enabled': 'true' });
    const m = await svc.map();
    expect(m).toEqual({ telegram: true, tg_direct: false, max: false, whatsapp: true });
  });
});
