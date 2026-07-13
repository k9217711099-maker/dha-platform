import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service.js';
import type { Env } from '../../config/env.schema.js';

function makeService(): CryptoService {
  const env: Record<string, string> = {
    PII_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    JWT_SECRET: 'test-secret-at-least-16-chars',
  };
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService<Env, true>;
  return new CryptoService(config);
}

describe('CryptoService', () => {
  it('шифрует и расшифровывает ПДн (round-trip)', () => {
    const svc = makeService();
    const plain = 'Паспорт 4012 №345678';
    const enc = svc.encryptPii(plain);
    expect(enc).not.toContain('Паспорт');
    expect(svc.decryptPii(enc)).toBe(plain);
  });

  it('каждый раз даёт разный шифротекст (случайный IV)', () => {
    const svc = makeService();
    expect(svc.encryptPii('abc')).not.toBe(svc.encryptPii('abc'));
  });

  it('hash детерминирован для одного значения', () => {
    const svc = makeService();
    expect(svc.hash('token')).toBe(svc.hash('token'));
    expect(svc.hash('a')).not.toBe(svc.hash('b'));
  });

  it('шифрует и расшифровывает бинарные данные (скан документа)', () => {
    const svc = makeService();
    const data = randomBytes(2048);
    const enc = svc.encryptBuffer(data);
    expect(enc.equals(data)).toBe(false);
    expect(svc.decryptBuffer(enc).equals(data)).toBe(true);
  });
});
