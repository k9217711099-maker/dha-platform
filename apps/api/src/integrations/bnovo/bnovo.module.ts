import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BnovoPort } from './bnovo.port.js';
import { BnovoAuthService } from './bnovo-auth.service.js';
import { MockBnovoAdapter } from './mock-bnovo.adapter.js';
import { HttpBnovoAdapter } from './http-bnovo.adapter.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Реализация BnovoPort выбирается по BNOVO_PROVIDER. Остальные модули инжектят
 * только BnovoPort — переключение mock↔http не затрагивает бизнес-логику.
 */
@Global()
@Module({
  providers: [
    BnovoAuthService,
    MockBnovoAdapter,
    HttpBnovoAdapter,
    {
      provide: BnovoPort,
      inject: [ConfigService, MockBnovoAdapter, HttpBnovoAdapter],
      useFactory: (config: ConfigService<Env, true>, mock: MockBnovoAdapter, http: HttpBnovoAdapter) =>
        config.get('BNOVO_PROVIDER', { infer: true }) === 'http' ? http : mock,
    },
  ],
  exports: [BnovoPort, HttpBnovoAdapter],
})
export class BnovoModule {}
