import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/tokens.service.js';
import { TelegramConfigService } from '../../integrations/telegram/telegram-config.service.js';
import { TelegramAgentService, type TelegramUpdate } from './telegram-agent.service.js';
import { TelegramLinkService } from './telegram-link.service.js';

/**
 * Webhook Telegram для гостевого AI-агента. Если задан TELEGRAM_WEBHOOK_SECRET —
 * проверяем заголовок X-Telegram-Bot-Api-Secret-Token. Отвечаем Telegram сразу
 * (200), а гостю агент отвечает асинхронно через sendMessage.
 */
@ApiTags('ai')
@Controller('ai/telegram')
export class TelegramController {
  constructor(
    private readonly service: TelegramAgentService,
    private readonly telegramConfig: TelegramConfigService,
    private readonly link: TelegramLinkService,
    private readonly jwt: JwtService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook Telegram (гостевой AI-агент)' })
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ): Promise<{ ok: true }> {
    const { webhookSecret } = await this.telegramConfig.resolve();
    if (webhookSecret && secret !== webhookSecret) {
      throw new UnauthorizedException('Неверный секрет вебхука');
    }
    void this.service.handleUpdate(update);
    return { ok: true };
  }

  @Post('link-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Токен и deep-link привязки Telegram к аккаунту гостя (нужен вход, §13)' })
  async linkToken(@Req() req: Request) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Требуется вход гостя');
    let guestId: string;
    try {
      guestId = (await this.jwt.verifyAsync<JwtPayload>(header.slice(7))).sub;
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }
    return this.link.createLinkToken(guestId);
  }
}
