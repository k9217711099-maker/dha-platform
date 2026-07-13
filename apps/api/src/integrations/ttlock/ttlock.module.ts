import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtlockPort } from './ttlock.port.js';
import { MockTtlockAdapter } from './mock-ttlock.adapter.js';
import { HttpTtlockAdapter } from './http-ttlock.adapter.js';
import type { Env } from '../../config/env.schema.js';

/** Реализация TtlockPort выбирается по TTLOCK_PROVIDER. */
@Global()
@Module({
  providers: [
    MockTtlockAdapter,
    HttpTtlockAdapter,
    {
      provide: TtlockPort,
      inject: [ConfigService, MockTtlockAdapter, HttpTtlockAdapter],
      useFactory: (config: ConfigService<Env, true>, mock: MockTtlockAdapter, http: HttpTtlockAdapter) =>
        config.get('TTLOCK_PROVIDER', { infer: true }) === 'http' ? http : mock,
    },
  ],
  exports: [TtlockPort],
})
export class TtlockModule {}
