import { Global, Module } from '@nestjs/common';
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
      useFactory: (config: ConfigService<Env, true>, mock: MockPassportAdapter, http: HttpPassportAdapter) =>
        config.get('PASSPORT_PROVIDER', { infer: true }) === 'http' ? http : mock,
    },
  ],
  exports: [PassportPort],
})
export class PassportModule {}
