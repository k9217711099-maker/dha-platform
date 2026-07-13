import { Injectable } from '@nestjs/common';

export interface PiiMaskResult {
  /** Текст с плейсхолдерами вместо ПДн. */
  masked: string;
  /** Плейсхолдер → исходное значение. Хранить на backend; в модель НЕ отправлять. */
  map: Record<string, string>;
}

/**
 * Маскирование ПДн во входящем тексте гостя перед отправкой в LLM (§8 ТЗ).
 * ОБЯЗАТЕЛЬНО при облачном провайдере (DeepSeek — данные уходят за рубеж). Обратимо
 * через unmask (напр. чтобы восстановить исходный текст в нашем журнале).
 *
 * Ловит структурные ПДн: email, телефон РФ, серия+номер паспорта, номер карты.
 * ФИО (NER) — отдельный шаг: надёжный разбор имён требует модели распознавания
 * сущностей, а не регулярок (см. maskNames — заготовка на будущее).
 */
@Injectable()
export class PiiMaskingService {
  /** Порядок важен: карта (16 цифр) до паспорта (10) и телефона. */
  private readonly patterns: Array<{ label: string; re: RegExp }> = [
    { label: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    { label: 'CARD', re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
    { label: 'PHONE', re: /(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/g },
    { label: 'PASSPORT', re: /\b\d{4}\s?\d{6}\b/g },
  ];

  /** Заменяет найденные ПДн на плейсхолдеры и возвращает карту для восстановления. */
  mask(text: string): PiiMaskResult {
    const map: Record<string, string> = {};
    const counters: Record<string, number> = {};
    let masked = text;
    for (const { label, re } of this.patterns) {
      masked = masked.replace(re, (match) => {
        counters[label] = (counters[label] ?? 0) + 1;
        const token = `[${label}_${counters[label]}]`;
        map[token] = match;
        return token;
      });
    }
    return { masked, map };
  }

  /** Восстанавливает исходные значения по карте (обратная операция к mask). */
  unmask(text: string, map: Record<string, string>): string {
    let out = text;
    for (const [token, value] of Object.entries(map)) {
      out = out.split(token).join(value);
    }
    return out;
  }
}
