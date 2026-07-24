import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { PassportPort, type PassportFields, type RecognizeResult, type VerifyInput, type VerifyResult } from './passport.port.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Распознавание паспорта РФ через Yandex Vision OCR (модель `passport`) — возвращает
 * структурные поля (ФИО, дата рождения, серия/номер, кем выдан, дата выдачи), включая
 * вертикальный красный номер и кириллицу, чего self-hosted Tesseract не умеет.
 *
 * 152-ФЗ: скан уходит во внешний сервис (Yandex Cloud, РФ) — только с согласия гостя.
 * В запросе выставляем `x-data-logging-enabled: false`, чтобы Yandex не сохранял данные.
 *
 * verify() — формат серии/номера + Dadata (список недействительных МВД), если настроен;
 * иначе MANUAL (проверяет сотрудник).
 */
@Injectable()
export class YandexVisionPassportAdapter extends PassportPort {
  private readonly logger = new Logger(YandexVisionPassportAdapter.name);

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  private lastTrace = '';

  /**
   * Значение переменной: process.env → ConfigService → чтение .env СВЕЖИМ ДОЧЕРНИМ
   * ПРОЦЕССОМ (grep). На этом сервере in-process readFileSync отдавал устаревшее
   * содержимое .env (аномалия кэша страниц/overlayfs), а внешний grep/node читает диск
   * верно — поэтому берём значение через execFileSync('grep').
   */
  private envValue(key: 'YANDEX_VISION_API_KEY' | 'YANDEX_VISION_FOLDER_ID' | 'YANDEX_VISION_OCR_URL'): string | undefined {
    const fromProc = process.env[key];
    if (fromProc) {
      this.lastTrace += `${key}=proc; `;
      return fromProc;
    }
    const fromCfg = this.config.get(key, { infer: true });
    if (fromCfg) {
      this.lastTrace += `${key}=cfg; `;
      return fromCfg;
    }
    for (const p of ['/var/www/dha/apps/api/.env', `${process.cwd()}/.env`]) {
      try {
        const line = execFileSync('grep', ['-m1', '-hE', `^${key}=`, p], { encoding: 'utf8', timeout: 3000 });
        const val = line.replace(new RegExp(`^${key}=`), '').replace(/[\r\n]+/g, '').trim();
        this.lastTrace += `[${p} grep=${val.length}] `;
        if (val) return val.replace(/^["']|["']$/g, '');
      } catch (e) {
        this.lastTrace += `[${p} ERR=${(e as Error).message.slice(0, 25)}] `;
      }
    }
    return undefined;
  }

  async recognize(scan: Buffer, contentType: string): Promise<RecognizeResult> {
    this.lastTrace = '';
    const apiKey = this.envValue('YANDEX_VISION_API_KEY');
    const folderId = this.envValue('YANDEX_VISION_FOLDER_ID');
    if (!apiKey || !folderId) {
      // ВРЕМЕННАЯ диагностика: полная трасса чтения в note (единственный надёжный канал).
      return { fields: {}, confidence: 0, source: 'page', note: `Yandex не настроен. [TRACE ${this.lastTrace}]`.slice(0, 950) };
    }

    const url =
      process.env.YANDEX_VISION_OCR_URL ??
      this.config.get('YANDEX_VISION_OCR_URL', { infer: true }) ??
      'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';
    // Ужимаем изображение ПЕРЕД отправкой: фото с телефона до 10 МБ раздувают процесс
    // (base64 в памяти) и вешают маленький VPS. Ресайз до 2200px + JPEG q80 = сотни КБ.
    // PDF/битые файлы шлём как есть.
    let payload = scan;
    let mime = this.mimeType(contentType);
    if ((contentType || '').toLowerCase().includes('image')) {
      try {
        payload = await sharp(scan)
          .rotate() // выпрямляем по EXIF — важно для OCR
          .resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        mime = 'image/jpeg';
        console.error(`[YANDEX-OCR] ресайз: ${scan.length} → ${payload.length} байт`);
      } catch (e) {
        console.error(`[YANDEX-OCR] ресайз не удался (${(e as Error).message}) — шлём оригинал`);
      }
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
          'x-data-logging-enabled': 'false',
        },
        body: JSON.stringify({
          mimeType: mime,
          languageCodes: ['ru', 'en'],
          model: 'passport',
          content: payload.toString('base64'),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[YANDEX-OCR] HTTP ${res.status}: ${body.slice(0, 300)}`);
        throw new Error(`Yandex Vision ${res.status}`);
      }
      const data = (await res.json()) as YandexOcrResponse;
      const entities = data.result?.textAnnotation?.entities ?? [];
      // Только ИМЕНА сущностей (без значений — это ПДн), чтобы сверить маппинг.
      console.error(`[YANDEX-OCR] сущности [${entities.map((e) => e.name).join(', ') || '—'}]`);

      const fields = this.mapEntities(entities);
      console.error(`[YANDEX-OCR] замаплено полей: ${Object.keys(fields).join(', ') || '—'}`);
      if (!Object.values(fields).some(Boolean)) {
        return { fields: {}, confidence: 0, source: 'yandex', note: 'Yandex Vision не извлёк поля — заполните вручную.' };
      }
      return { fields, confidence: 0.9, source: 'yandex', note: 'Распознано Yandex Vision (модель passport).' };
    } catch (e) {
      console.error(`[YANDEX-OCR] ошибка: ${(e as Error).message}`);
      return { fields: {}, confidence: 0, source: 'yandex', note: 'Сервис распознавания недоступен — заполните поля вручную.' };
    } finally {
      clearTimeout(t);
    }
  }

  /** Собираем наши поля из сущностей Yandex (имена сущностей мапим терпимо — по нескольким вариантам). */
  private mapEntities(entities: YandexEntity[]): PassportFields {
    const by = new Map<string, string>();
    for (const e of entities) {
      if (e?.name && typeof e.text === 'string' && e.text.trim()) by.set(e.name.toLowerCase(), e.text.trim());
    }
    const pick = (...names: string[]) => {
      for (const n of names) {
        const v = by.get(n);
        if (v) return v;
      }
      return undefined;
    };

    const fields: PassportFields = {};
    const last = pick('surname', 'last_name', 'lastname');
    const first = pick('name', 'first_name', 'firstname', 'given_name');
    const middle = pick('patronymic', 'middle_name', 'middlename');
    if (last) fields.lastName = this.title(last);
    if (first) fields.firstName = this.title(first);
    if (middle) fields.middleName = this.title(middle);

    const bd = this.toIso(pick('birth_date', 'birthdate', 'date_of_birth'));
    if (bd) fields.birthDate = bd;

    const issuedBy = pick('issued_by', 'authority', 'issuing_authority');
    if (issuedBy) fields.issuedBy = issuedBy;
    const issuedDate = this.toIso(pick('issue_date', 'issued_date', 'date_of_issue'));
    if (issuedDate) fields.issuedDate = issuedDate;

    // Серия/номер: либо единым полем «4017 123456», либо раздельно.
    const combined = pick('series_and_number', 'number_and_series', 'series_number');
    const { series, number } = this.splitSeriesNumber(combined, pick('series'), pick('number', 'passport_number'));
    if (series) fields.series = series;
    if (number) fields.number = number;
    return fields;
  }

  private splitSeriesNumber(combined?: string, series?: string, number?: string): { series?: string; number?: string } {
    const digits = (s?: string) => (s ? s.replace(/\D/g, '') : '');
    let s = digits(series);
    let n = digits(number);
    if ((!s || !n) && combined) {
      const d = digits(combined);
      if (d.length >= 10) {
        s = s || d.slice(0, 4);
        n = n || d.slice(4, 10);
      }
    }
    return { series: /^\d{4}$/.test(s) ? s : undefined, number: /^\d{6}$/.test(n) ? n : undefined };
  }

  /** «12.05.1990» / «1990-05-12» → «1990-05-12». */
  private toIso(v?: string): string | undefined {
    if (!v) return undefined;
    const dmy = v.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const ymd = v.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    return undefined;
  }

  private title(s: string): string {
    return s
      .toLocaleLowerCase('ru-RU')
      .replace(/(^|[\s-])([\p{L}])/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('ru-RU'));
  }

  private mimeType(contentType: string): string {
    const c = (contentType || '').toLowerCase();
    if (c.includes('png')) return 'image/png';
    if (c.includes('pdf')) return 'application/pdf';
    return 'image/jpeg';
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
      return { verdict: 'MANUAL', note: 'Проверка по списку МВД не настроена (Dadata) — нужна ручная проверка.' };
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch('https://cleaner.dadata.ru/api/v1/clean/passport', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${key}`,
          'X-Secret': secret,
        },
        body: JSON.stringify([`${series} ${number}`]),
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`Dadata ${res.status}`);
      const arr = (await res.json()) as { qc?: number }[];
      const qc = arr?.[0]?.qc;
      if (qc === 0) return { verdict: 'VALID', note: 'Паспорт действителен (Dadata: не в списке недействительных МВД).' };
      if (qc === 1) return { verdict: 'INVALID', note: 'Паспорт не прошёл проверку (Dadata: некорректен/в списке недействительных).' };
      return { verdict: 'MANUAL', note: 'Dadata: неоднозначный результат — нужна ручная проверка.' };
    } catch (e) {
      this.logger.warn(`Dadata недоступна (${(e as Error).message})`);
      return { verdict: 'MANUAL', note: 'Сервис проверки недоступен — нужна ручная проверка.' };
    }
  }
}

interface YandexEntity {
  name: string;
  text: string;
}
interface YandexOcrResponse {
  result?: {
    textAnnotation?: {
      entities?: YandexEntity[];
      fullText?: string;
    };
  };
}
