import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AiChannel } from '@prisma/client';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import type { JwtPayload } from '../../auth/tokens.service.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit/rate-limit.guard.js';
import { GuestAgentService } from './guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { GuestMessageDto } from './dto/guest-message.dto.js';

/**
 * HTTP-вход гостевого AI-агента (web/app-виджет). Авторизация ОПЦИОНАЛЬНА: аноним
 * получает поиск/справку/эскалацию; при валидном Bearer — привязывается guestId и
 * становятся доступны расчёт цены и оформление брони. TenantService — из @Global
 * PmsModule; JwtService — из глобального JwtModule.
 * Публичный эндпоинт (дорогие вызовы LLM) защищён rate-limit по IP.
 */
@ApiTags('ai')
@Controller('ai/guest')
@UseGuards(RateLimitGuard)
export class GuestAgentController {
  constructor(
    private readonly agent: GuestAgentService,
    private readonly tenant: TenantService,
    private readonly jwt: JwtService,
    private readonly conversations: ConversationService,
  ) {}

  @Post('message')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: 'Сообщение гостя AI-администратору (авторизация опциональна)' })
  async message(@Body() dto: GuestMessageDto, @Req() req: Request) {
    const tenantId = await this.tenant.getDefaultTenantId();
    const guestId = await this.extractGuestId(req);
    return this.agent.handle({
      conversationId: dto.conversationId,
      tenantId,
      guestId,
      channel: dto.channel ?? AiChannel.WEB,
      text: dto.text,
    });
  }

  @Get('conversation/:id')
  @ApiOperation({
    summary: 'История диалога (web/app опрашивают её, чтобы показать ответы оператора после эскалации)',
  })
  conversation(@Param('id') id: string) {
    // conversationId — это capability (uuid, известен только клиенту диалога).
    return this.conversations.threadView(id);
  }

  /** Опциональная авторизация: валидный Bearer → guestId; иначе аноним. */
  private async extractGuestId(req: Request): Promise<string | undefined> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
