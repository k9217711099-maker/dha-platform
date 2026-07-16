import { Global, Module } from '@nestjs/common';
import { TelegramUserbotPort } from './telegram-userbot.port.js';
import { TelegramUserbotService } from './telegram-userbot.service.js';

/**
 * Telegram Direct (userbot, GramJS). @Global — порт для отправки, сервис для
 * админ-контроллера (вход/статус/logout) и регистрации обработчика входящих
 * (TgUserbotAgentService в ai/channels).
 */
@Global()
@Module({
  providers: [
    TelegramUserbotService,
    { provide: TelegramUserbotPort, useExisting: TelegramUserbotService },
  ],
  exports: [TelegramUserbotPort, TelegramUserbotService],
})
export class TelegramUserbotModule {}
