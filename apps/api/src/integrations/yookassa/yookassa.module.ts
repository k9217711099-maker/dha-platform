import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayPort } from './payment-gateway.port.js';
import { MockYooKassaAdapter } from './mock-yookassa.adapter.js';
import { HttpYooKassaAdapter } from './http-yookassa.adapter.js';
import { YooKassaConfigService } from './yookassa-config.service.js';
import { HttpBspbAdapter } from '../bspb/http-bspb.adapter.js';
import { BspbConfigService } from '../bspb/bspb-config.service.js';
import { HttpPaykeeperAdapter } from '../paykeeper/http-paykeeper.adapter.js';
import { PaykeeperConfigService } from '../paykeeper/paykeeper-config.service.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Реализация PaymentGatewayPort (эквайринг) выбирается по PAYMENT_PROVIDER.
 * Если он не задан — обратная совместимость по YOOKASSA_PROVIDER.
 *   mock → in-memory; yookassa → ЮKassa; bspb → Банк «Санкт-Петербург»; paykeeper → PayKeeper.
 * Реквизиты БСПБ/PayKeeper читаются динамически (Config-сервисы: админка → Setting,
 * env как запас), поэтому для них всегда используется HTTP-адаптер.
 */
@Global()
@Module({
  providers: [
    MockYooKassaAdapter,
    YooKassaConfigService,
    HttpYooKassaAdapter,
    BspbConfigService,
    HttpBspbAdapter,
    PaykeeperConfigService,
    HttpPaykeeperAdapter,
    {
      provide: PaymentGatewayPort,
      inject: [ConfigService, MockYooKassaAdapter, HttpYooKassaAdapter, HttpBspbAdapter, HttpPaykeeperAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        mockYk: MockYooKassaAdapter,
        httpYk: HttpYooKassaAdapter,
        httpBspb: HttpBspbAdapter,
        httpPaykeeper: HttpPaykeeperAdapter,
      ) => {
        const explicit = config.get('PAYMENT_PROVIDER', { infer: true });
        const provider =
          explicit ?? (config.get('YOOKASSA_PROVIDER', { infer: true }) === 'yookassa' ? 'yookassa' : 'mock');
        if (provider === 'yookassa') return httpYk;
        if (provider === 'bspb') return httpBspb;
        if (provider === 'paykeeper') return httpPaykeeper;
        return mockYk;
      },
    },
  ],
  exports: [PaymentGatewayPort, MockYooKassaAdapter, YooKassaConfigService, HttpYooKassaAdapter, BspbConfigService, HttpBspbAdapter, PaykeeperConfigService, HttpPaykeeperAdapter],
})
export class YooKassaModule {}
