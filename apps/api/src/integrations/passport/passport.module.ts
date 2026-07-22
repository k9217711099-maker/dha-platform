import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportPort } from './passport.port.js';
import { MockPassportAdapter } from './mock-passport.adapter.js';
import { HttpPassportAdapter } from './http-passport.adapter.js';
import type { Env } from '../../config/env.schema.js';

/** Реализация PassportPort выбирается по PASSPORT_PROVIDER (mock | http). */
@Global()
@Module({
  providers: [
    MockPassportAdapter,
    HttpPassportAdapter,
    {
      provide: PassportPort,
      inject: [ConfigService, MockPassportAdapter, HttpPassportAdapter],
      useFactory: (config: ConfigService<Env, true>, mock: MockPassportAdapter, http: HttpPassportAdapter) => {
        // process.env читаем напрямую (надёжнее ConfigService на боевом окружении, где
        // флаг задаётся через pm2 --update-env), с фолбэком на ConfigService.
        const provider = process.env.PASSPORT_PROVIDER ?? config.get('PASSPORT_PROVIDER', { infer: true });
        const useHttp = provider === 'http';
        Logger.log(
          `Паспорт-адаптер: PASSPORT_PROVIDER=${provider ?? '(не задан)'} → ${useHttp ? 'HTTP (OCR-сайдкар)' : 'MOCK (демо)'}`,
          'PassportModule',
        );
        return useHttp ? http : mock;
      },
    },
  ],
  exports: [PassportPort],
})
export class PassportModule {}
