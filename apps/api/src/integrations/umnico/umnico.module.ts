import { Global, Module } from '@nestjs/common';
import { UmnicoConfigService } from './umnico-config.service.js';

/**
 * Umnico (омниканальный агрегатор). @Global — UmnicoConfigService доступен для
 * админ-контроллера (токен/каналы/тест), отправки и приёма (UmnicoAgentService).
 */
@Global()
@Module({
  providers: [UmnicoConfigService],
  exports: [UmnicoConfigService],
})
export class UmnicoModule {}
