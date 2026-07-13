import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalPort } from './fiscal.port.js';
import { NoFiscalAdapter } from './no-fiscal.adapter.js';
import { MockFiscalAdapter } from './mock-fiscal.adapter.js';
import { AtolFiscalAdapter } from './atol-fiscal.adapter.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Реализация FiscalPort выбирается по FISCAL_PROVIDER: none/mock/atol.
 * Нужна, когда эквайер не бьёт чек сам (БСПБ). Для ЮKassa обычно none.
 */
@Global()
@Module({
  providers: [
    NoFiscalAdapter,
    MockFiscalAdapter,
    AtolFiscalAdapter,
    {
      provide: FiscalPort,
      inject: [ConfigService, NoFiscalAdapter, MockFiscalAdapter, AtolFiscalAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        none: NoFiscalAdapter,
        mock: MockFiscalAdapter,
        atol: AtolFiscalAdapter,
      ) => {
        switch (config.get('FISCAL_PROVIDER', { infer: true })) {
          case 'mock':
            return mock;
          case 'atol':
            return atol;
          default:
            return none;
        }
      },
    },
  ],
  exports: [FiscalPort],
})
export class FiscalModule {}
