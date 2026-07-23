import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async recognize(scan: Buffer, contentType: string): Promise<RecognizeResult> {
    const apiKey = this.config.get('YANDEX_VISION_API_KEY', { infer: true });
    const folderId = this.config.get('YANDEX_VISION_FOLDER_ID', { infer: true });
    if (!apiKey || !folderId) {
      return { fields: {}, confidence: 0, source: 'page', note: 'Yandex Vision не настроен (нет ключа/каталога) — заполните поля вручную.' };
    }

    const url = this.config.get('YANDEX_VISION_OCR_URL', { infer: true });
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
          mimeType: this.mimeType(contentType),
          languageCodes: ['ru', 'en'],
          model: 'passport',
          content: scan.toString('base64'),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Yandex Vision ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as YandexOcrResponse;
      const entities = data.result?.textAnnotation?.entities ?? [];
      // Логируем ТОЛЬКО имена сущностей (без значений — это ПДн), чтобы сверить маппинг.
      this.logger.log(`Yandex Vision: сущности [${entities.map((e) => e.name).join(', ') || '—'}]`);

      const fields = this.mapEntities(entities);
      if (!Object.values(fields).some(Boolean)) {
        return { fields: {}, confidence: 0, source: 'yandex', note: 'Yandex Vision не извлёк поля — заполните вручную.' };
      }
      return { fields, confidence: 0.9, source: 'yandex', note: 'Распознано Yandex Vision (модель passport).' };
    } catch (e) {
      this.logger.warn(`Yandex Vision недоступен (${(e as Error).message}) — поля вводятся вручную`);
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
