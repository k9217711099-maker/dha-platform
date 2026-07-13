import { describe, expect, it } from 'vitest';
import { MockStorageAdapter } from './mock-storage.adapter.js';

describe('MockStorageAdapter', () => {
  it('кладёт и возвращает объект', async () => {
    const s = new MockStorageAdapter();
    const body = Buffer.from('секрет');
    await s.put('k1', body, 'application/octet-stream');
    expect((await s.get('k1')).equals(body)).toBe(true);
    expect(await s.getSignedUrl('k1')).toContain('k1');
  });

  it('удаляет объект', async () => {
    const s = new MockStorageAdapter();
    await s.put('k2', Buffer.from('x'), 'text/plain');
    await s.delete('k2');
    await expect(s.get('k2')).rejects.toThrow();
  });
});
