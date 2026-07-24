import { Injectable } from '@nestjs/common';
import { PassportPort, type RecognizeResult, type VerifyInput, type VerifyResult } from './passport.port.js';

/**
 * Демо-реализация: распознавание возвращает образец, проверка действительности —
 * по формату (без обращения к внешним сервисам). Позволяет прокликать весь сценарий
 * без ключей и затрат. Реальная точность — в HttpPassportAdapter (OCR-сайдкар + Dadata).
 */
@Injectable()
export class MockPassportAdapter extends PassportPort {
  async recognize(_scan: Buffer, _contentType: string): Promise<RecognizeResult> {
    // В проде НЕ подставляем демо-данные — иначе гость может отправить фейковый паспорт.
    // Пустые поля = ручной ввод. Образец «Иванова» отдаём только вне production (прокликать сценарий).
    if (process.env.NODE_ENV === 'production') {
      return { fields: {}, confidence: 0, source: 'mock', note: 'Автораспознавание не подключено — заполните поля вручную.' };
    }
    return {
      fields: {
        series: '4017',
        number: '123456',
        lastName: 'ИВАНОВ',
        firstName: 'ИВАН',
        middleName: 'ИВАНОВИЧ',
        birthDate: '1990-05-12',
        issuedBy: 'ГУ МВД России по г. Санкт-Петербургу',
        issuedDate: '2017-06-20',
      },
      confidence: 0.62,
      source: 'mock',
      note: 'Демо-распознавание (mock, только dev). Для реальных данных — PASSPORT_PROVIDER=yandex.',
    };
  }

  async recognizeAddress(_scan: Buffer, _contentType: string): Promise<RecognizeResult> {
    // Демо не читает адрес — вводится вручную (реально это делает Yandex-адаптер).
    return { fields: {}, confidence: 0, source: 'mock', note: 'Демо: адрес регистрации вводится вручную.' };
  }

  async verify(input: VerifyInput): Promise<VerifyResult> {
    const series = (input.series ?? '').replace(/\s/g, '');
    const number = (input.number ?? '').replace(/\s/g, '');
    if (!series || !number) {
      return { verdict: 'MANUAL', note: 'Недостаточно данных для проверки — нужна ручная проверка.' };
    }
    if (!/^\d{4}$/.test(series) || !/^\d{6}$/.test(number)) {
      return { verdict: 'MANUAL', note: 'Неверный формат серии/номера — нужна ручная проверка.' };
    }
    // Демо-триггер «недействителен»
    if (series === '0000' || number === '000000') {
      return { verdict: 'INVALID', note: 'Числится в списке недействительных паспортов МВД (демо).' };
    }
    return {
      verdict: 'VALID',
      note: 'Формат корректен; в списке недействительных МВД не значится (демо-проверка).',
    };
  }
}
