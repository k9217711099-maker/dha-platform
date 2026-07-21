import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { UmnicoConfigService } from './umnico-config.service.js';
import type { SettingsService } from '../../common/settings/settings.service.js';
import type { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

function makeService(token = 'tok'): UmnicoConfigService {
  const settings = { get: vi.fn().mockResolvedValue(null) } as unknown as SettingsService;
  const crypto = { decryptPii: vi.fn((s: string) => s) } as unknown as CryptoService;
  const config = {
    get: vi.fn((k: string) =>
      k === 'UMNICO_API_BASE' ? 'https://api.umnico.com' : k === 'UMNICO_TOKEN' ? token : undefined,
    ),
  } as unknown as ConfigService<Env, true>;
  return new UmnicoConfigService(settings, crypto, config);
}

describe('UmnicoConfigService.reachOutFirst', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('успех: POST /v1.3/messaging/post, номер очищен от «+», вернулся leadId', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ leadId: 555 }) });
    const r = await makeService().reachOutFirst(75, '+7 (902) 201-36-36', 'Привет', 'book1:invite');
    expect(r).toEqual({ ok: true, leadId: '555' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.umnico.com/v1.3/messaging/post');
    expect(JSON.parse(String(init.body))).toEqual({
      message: { text: 'Привет' },
      destination: '79022013636',
      saId: 75,
      customId: 'book1:invite',
    });
  });

  it('нет токена → ok:false, fetch не вызывается', async () => {
    const r = await makeService('').reachOutFirst(75, '79000000000', 'hi');
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('пустой номер → ok:false, fetch не вызывается', async () => {
    const r = await makeService().reachOutFirst(75, '+++', 'hi');
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ответ не ok (номер не в канале) → ok:false с кодом ошибки', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'number not on whatsapp' });
    const r = await makeService().reachOutFirst(75, '79000000000', 'hi');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('422');
  });
});
