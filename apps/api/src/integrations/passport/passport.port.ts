/**
 * Порт верификации паспорта (anti-corruption layer).
 * Две задачи: распознать поля со скана (OCR) и проверить действительность.
 * Реализации: MockPassportAdapter (демо, без внешних сервисов) и
 * HttpPassportAdapter (self-hosted OCR-сайдкар + Dadata по списку МВД).
 * Скан паспорта НИКОГДА не уходит в сторонние облака без согласия — по умолчанию
 * распознавание идёт на нашем OCR-сервисе (152-ФЗ).
 */

/** Распознанные поля паспорта (могут быть частично пустыми). */
export interface PassportFields {
  series?: string;
  number?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  birthDate?: string; // YYYY-MM-DD
  issuedBy?: string;
  issuedDate?: string; // YYYY-MM-DD
}

export interface RecognizeResult {
  fields: PassportFields;
  /** Уверенность распознавания 0..1. */
  confidence: number;
  /** Источник: MRZ / страница / Yandex Vision / демо. */
  source: 'mrz' | 'page' | 'yandex' | 'mock';
  /** Пояснение для UI/лога. */
  note: string;
}

export type PassportVerdict = 'VALID' | 'INVALID' | 'MANUAL';

export interface VerifyResult {
  verdict: PassportVerdict;
  note: string;
}

/** Что проверяем на действительность. */
export interface VerifyInput {
  series?: string;
  number?: string;
  birthDate?: string;
}

export abstract class PassportPort {
  /** Распознать поля паспорта со скана (изображение/PDF). */
  abstract recognize(scan: Buffer, contentType: string): Promise<RecognizeResult>;
  /** Проверить действительность паспорта (формат + список недействительных МВД). */
  abstract verify(input: VerifyInput): Promise<VerifyResult>;
}
