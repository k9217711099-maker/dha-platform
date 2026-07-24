import { Injectable, Logger } from '@nestjs/common';
import { PassportPort, type RecognizeResult, type VerifyInput, type VerifyResult } from './passport.port.js';
import { MockPassportAdapter } from './mock-passport.adapter.js';
import { HttpPassportAdapter } from './http-passport.adapter.js';
import { YandexVisionPassportAdapter } from './yandex-vision-passport.adapter.js';

/**
 * Выбирает реализацию распознавания по PASSPORT_PROVIDER — но НА КАЖДЫЙ ЗАПРОС, читая
 * process.env напрямую. Раньше выбор делала фабрика при старте через ConfigService, и на
 * боевом окружении она «залипала» на mock (config.get не отдавал значение) — переезд на
 * чтение process.env в момент вызова снимает это раз и навсегда, без зависимости от
 * порядка инициализации и кэша конфига.
 *
 *   yandex → Yandex Vision OCR (паспорт РФ, точно)
 *   http   → self-hosted Tesseract-сайдкар
 *   иначе  → mock (демо/ручной ввод)
 */
@Injectable()
export class PassportRouterAdapter extends PassportPort {
  private readonly logger = new Logger(PassportRouterAdapter.name);
  private lastLogged = '';

  constructor(
    private readonly mock: MockPassportAdapter,
    private readonly http: HttpPassportAdapter,
    private readonly yandex: YandexVisionPassportAdapter,
  ) {
    super();
  }

  private pick(): PassportPort {
    const provider = process.env.PASSPORT_PROVIDER;
    if (provider !== this.lastLogged) {
      this.logger.log(`Паспорт-провайдер: PASSPORT_PROVIDER=${provider ?? '(не задан)'}`);
      this.lastLogged = provider ?? '';
    }
    if (provider === 'yandex') return this.yandex;
    if (provider === 'http') return this.http;
    return this.mock;
  }

  recognize(scan: Buffer, contentType: string): Promise<RecognizeResult> {
    return this.pick().recognize(scan, contentType);
  }

  recognizeAddress(scan: Buffer, contentType: string): Promise<RecognizeResult> {
    return this.pick().recognizeAddress(scan, contentType);
  }

  verify(input: VerifyInput): Promise<VerifyResult> {
    return this.pick().verify(input);
  }
}
