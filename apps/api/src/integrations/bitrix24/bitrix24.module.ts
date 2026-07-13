import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bitrix24Port } from './bitrix24.port.js';
import { MockBitrix24Adapter } from './mock-bitrix24.adapter.js';
import { HttpBitrix24Adapter } from './http-bitrix24.adapter.js';
import type { Env } from '../../config/env.schema.js';

/** Реализация Bitrix24Port выбирается по BITRIX24_PROVIDER. */
@Global()
@Module({
  providers: [
    MockBitrix24Adapter,
    HttpBitrix24Adapter,
    {
      provide: Bitrix24Port,
      inject: [ConfigService, MockBitrix24Adapter, HttpBitrix24Adapter],
      useFactory: (config: ConfigService<Env, true>, mock: MockBitrix24Adapter, http: HttpBitrix24Adapter) =>
        config.get('BITRIX24_PROVIDER', { infer: true }) === 'http' ? http : mock,
    },
  ],
  exports: [Bitrix24Port],
})
export class Bitrix24Module {}
