import { Global, Module } from '@nestjs/common';
import { PassportPort } from './passport.port.js';
import { MockPassportAdapter } from './mock-passport.adapter.js';
import { HttpPassportAdapter } from './http-passport.adapter.js';
import { YandexVisionPassportAdapter } from './yandex-vision-passport.adapter.js';
import { PassportRouterAdapter } from './passport-router.adapter.js';

/**
 * PassportPort = роутер, выбирающий mock | http | yandex по PASSPORT_PROVIDER на каждый
 * запрос (см. PassportRouterAdapter — читает process.env в момент вызова, без «залипания»).
 */
@Global()
@Module({
  providers: [
    MockPassportAdapter,
    HttpPassportAdapter,
    YandexVisionPassportAdapter,
    { provide: PassportPort, useClass: PassportRouterAdapter },
  ],
  exports: [PassportPort],
})
export class PassportModule {}
