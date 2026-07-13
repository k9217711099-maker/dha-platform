import { Global, Module } from '@nestjs/common';
import { OtaMessagingPort } from './ota-messaging.port.js';
import { NoopOtaMessagingAdapter } from './noop-ota-messaging.adapter.js';

/**
 * OTA-messaging (CHECK-IN-TZ §5.1). Пока единственная реализация — noop;
 * реальные адаптеры (Booking Messaging API и т.п.) — по мере открытия доступа (§16.3).
 */
@Global()
@Module({
  providers: [{ provide: OtaMessagingPort, useClass: NoopOtaMessagingAdapter }],
  exports: [OtaMessagingPort],
})
export class OtaMessagingModule {}
