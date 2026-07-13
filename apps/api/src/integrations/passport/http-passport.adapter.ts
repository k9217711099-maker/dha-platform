import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportPort, type RecognizeResult, type VerifyInput, type VerifyResult } from './passport.port.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Боевая реализация:
 *  - recognize → self-hosted OCR-сайдкар (PaddleOCR + MRZ), скан не уходит в облако;
 *  - verify    → Dadata «Проверка паспорта» (формат + список недействительных МВД).
 * Оба сервиса включаются независимо; при недоступности — мягкий фолбэк на «нужна
 * ручная проверка», чтобы регистрация гостя не блокировалась.
 */
@Injectable()
export class HttpPassportAdapter extends PassportPort {
  private readonly logger = new Logger(HttpPassportAdapter.name);

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  private async fetchJson(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async recognize(scan: Buffer, contentType: string): Promise<RecognizeResult> {
    const base = this.config.get('PASSPORT_OCR_URL', { infer: true });
    try {
      const res = await this.fetchJson(`${base}/recognize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: scan.toString('base64'), contentType }),
      });
      if (!res.ok) throw new Error(`OCR ${res.status}`);
      const data = (await res.json()) as RecognizeResult;
      return {
        fields: data.fields ?? {},
        confidence: data.confidence ?? 0,
        source: data.source ?? 'page',
        note: data.note ?? 'Распознано OCR-сервисом.',
      };
    } catch (e) {
      this.logger.warn(`OCR недоступен (${(e as Error).message}) — поля вводятся вручную`);
      return { fields: {}, confidence: 0, source: 'page', note: 'OCR-сервис недоступен — заполните поля вручную.' };
    }
  }

  async verify(input: VerifyInput): Promise<VerifyResult> {
    const series = (input.series ?? '').replace(/\s/g, '');
    const number = (input.number ?? '').replace(/\s/g, '');
    if (!/^\d{4}$/.test(series) || !/^\d{6}$/.test(number)) {
      return { verdict: 'MANUAL', note: 'Неверный формат серии/номера — нужна ручная проверка.' };
    }

    const key = this.config.get('DADATA_API_KEY', { infer: true });
    const secret = this.config.get('DADATA_SECRET', { infer: true });
    if (!key || !secret) {
      return { verdict: 'MANUAL', note: 'Dadata не настроен (нет ключа) — нужна ручная проверка.' };
    }

    try {
      const res = await this.fetchJson('https://cleaner.dadata.ru/api/v1/clean/passport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${key}`,
          'X-Secret': secret,
        },
        body: JSON.stringify([`${series} ${number}`]),
      });
      if (!res.ok) throw new Error(`Dadata ${res.status}`);
      const arr = (await res.json()) as { qc?: number }[];
      const qc = arr?.[0]?.qc;
      // qc: 0 — корректен и не в списке недействительных; 1 — некорректен/недействителен; иначе — неоднозначно
      if (qc === 0) return { verdict: 'VALID', note: 'Паспорт действителен (Dadata: не в списке недействительных МВД).' };
      if (qc === 1) return { verdict: 'INVALID', note: 'Паспорт не прошёл проверку (Dadata: некорректен/в списке недействительных).' };
      return { verdict: 'MANUAL', note: 'Dadata: неоднозначный результат — нужна ручная проверка.' };
    } catch (e) {
      this.logger.warn(`Dadata недоступна (${(e as Error).message})`);
      return { verdict: 'MANUAL', note: 'Сервис проверки недоступен — нужна ручная проверка.' };
    }
  }
}
