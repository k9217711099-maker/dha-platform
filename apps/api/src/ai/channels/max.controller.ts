import { Body, Controller, Headers, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaxConfigService } from '../../integrations/max/max-config.service.js';
import { MaxAgentService, type MaxUpdate } from './max-agent.service.js';

/**
 * Webhook MAX для гостевого AI-агента (альтернатива long polling). Если задан
 * секрет вебхука — проверяем его в заголовке X-Max-Bot-Api-Secret или в query
 * ?secret= (URL регистрируется через POST /subscriptions). Отвечаем сразу 200,
 * агент отвечает гостю асинхронно через sendMessage.
 */
@ApiTags('ai')
@Controller('ai/max')
export class MaxController {
  constructor(
    private readonly service: MaxAgentService,
    private readonly maxConfig: MaxConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook MAX (гостевой AI-агент)' })
  async webhook(
    @Body() update: MaxUpdate,
    @Headers('x-max-bot-api-secret') headerSecret?: string,
    @Query('secret') querySecret?: string,
  ): Promise<{ ok: true }> {
    const { webhookSecret } = await this.maxConfig.resolve();
    if (webhookSecret && headerSecret !== webhookSecret && querySecret !== webhookSecret) {
      throw new UnauthorizedException('Неверный секрет вебхука');
    }
    void this.service.handleUpdate(update);
    return { ok: true };
  }
}
