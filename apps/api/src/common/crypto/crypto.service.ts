import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/**
 * Шифрование персональных данных (AES-256-GCM) и хэширование секретов.
 * Используется для паспортных данных (152-ФЗ) и для хранения хэшей токенов/OTP.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly hmacKey: string;

  constructor(config: ConfigService<Env, true>) {
    const keyB64: string = config.get('PII_ENCRYPTION_KEY', { infer: true });
    this.key = Buffer.from(keyB64, 'base64');
    this.hmacKey = config.get('JWT_SECRET', { infer: true });
  }

  /** Зашифровать строку ПДн. Формат результата: base64(iv | tag | ciphertext). */
  encryptPii(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  /** Расшифровать строку, зашифрованную encryptPii. */
  decryptPii(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + 16);
    const ct = buf.subarray(IV_LEN + 16);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  /** Зашифровать бинарные данные (сканы документов). Формат: iv | tag | ciphertext. */
  encryptBuffer(data: Buffer): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]);
  }

  /** Расшифровать бинарные данные, зашифрованные encryptBuffer. */
  decryptBuffer(payload: Buffer): Buffer {
    const iv = payload.subarray(0, IV_LEN);
    const tag = payload.subarray(IV_LEN, IV_LEN + 16);
    const ct = payload.subarray(IV_LEN + 16);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  /** Детерминированный HMAC-хэш (для refresh-токенов и OTP-кодов). */
  hash(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }
}
