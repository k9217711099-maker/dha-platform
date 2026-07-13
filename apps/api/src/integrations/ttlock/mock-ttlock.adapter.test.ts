import { describe, expect, it } from 'vitest';
import { MockTtlockAdapter } from './mock-ttlock.adapter.js';

describe('MockTtlockAdapter', () => {
  it('создаёт PIN и удаляет код', async () => {
    const a = new MockTtlockAdapter();
    const res = await a.createPasscode({
      lockId: 'lock-1',
      startMs: Date.now(),
      endMs: Date.now() + 3_600_000,
    });
    expect(res.ttlockKeyId).toContain('ttlock-');
    expect(res.pin).toMatch(/^\d{6}$/);
    await expect(a.deletePasscode('lock-1', res.ttlockKeyId)).resolves.toBeUndefined();
  });

  it('использует переданный PIN', async () => {
    const a = new MockTtlockAdapter();
    const res = await a.createPasscode({ lockId: 'l', pin: '424242', startMs: 0, endMs: 1 });
    expect(res.pin).toBe('424242');
  });
});
