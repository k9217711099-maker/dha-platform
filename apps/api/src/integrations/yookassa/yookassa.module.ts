import { Global, Module } from '@nestjs/common';
import { PaymentGatewayPort } from './payment-gateway.port.js';
import { MockYooKassaAdapter } from './mock-yookassa.adapter.js';
import { HttpYooKassaAdapter } from './http-yookassa.adapter.js';
import { YooKassaConfigService } from './yookassa-config.service.js';
import { PaymentProviderService } from './payment-provider.service.js';
import { PaymentGatewayDispatcher } from './payment-gateway.dispatcher.js';
import { HttpBspbAdapter } from '../bspb/http-bspb.adapter.js';
import { BspbConfigService } from '../bspb/bspb-config.service.js';
import { HttpPaykeeperAdapter } from '../paykeeper/http-paykeeper.adapter.js';
import { PaykeeperConfigService } from '../paykeeper/paykeeper-config.service.js';

/**
 * Реализация PaymentGatewayPort — диспетчер, который на каждый вызов выбирает
 * активный эквайер (PaymentProviderService: админка → Setting, env как запас):
 *   mock → in-memory; yookassa → ЮKassa; bspb → Банк «Санкт-Петербург»; paykeeper → PayKeeper.
 * Все реквизиты читаются динамически (Config-сервисы), поэтому смена эквайринга и
 * его настройка выполняются из админки без правки .env и перезапуска API.
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
    PaymentProviderService,
    { provide: PaymentGatewayPort, useClass: PaymentGatewayDispatcher },
  ],
  exports: [PaymentGatewayPort, MockYooKassaAdapter, YooKassaConfigService, HttpYooKassaAdapter, PaymentProviderService, BspbConfigService, HttpBspbAdapter, PaykeeperConfigService, HttpPaykeeperAdapter],
})
export class YooKassaModule {}
