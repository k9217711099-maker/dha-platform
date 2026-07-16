import { Global, Module } from '@nestjs/common';
import { WhatsAppPort } from './whatsapp.port.js';
import { WhatsAppService } from './whatsapp.service.js';

/**
 * WhatsApp (Baileys, неофициально). @Global — WhatsAppPort доступен для отправки,
 * WhatsAppService — для админ-контроллера (статус/QR/logout) и регистрации
 * обработчика входящих (WhatsAppAgentService в ai/channels).
 */
@Global()
@Module({
  providers: [WhatsAppService, { provide: WhatsAppPort, useExisting: WhatsAppService }],
  exports: [WhatsAppPort, WhatsAppService],
})
export class WhatsAppModule {}
