import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UmnicoAgentService } from './umnico-agent.service.js';

/** Сырой вебхук Umnico — поля message разбираем защитно (точную схему уточним по факту). */
interface UmnicoWebhook {
  type?: string;
  leadId?: number | string;
  message?: {
    text?: string;
    body?: string;
    direction?: string;
    isOutgoing?: boolean;
    userId?: number | string;
    user?: { id?: number | string };
    saId?: number | string;
    source?: { realId?: string; id?: number | string } | string | number;
  };
}

/**
 * Webhook Umnico (событие message.incoming). Отвечаем сразу 200, а гостю агент
 * отвечает асинхронно через Umnico API. Точные поля message в разных типах
 * каналов Umnico могут отличаться — извлекаем защитно и логируем при неполноте.
 */
@ApiTags('ai')
@Controller('ai/umnico')
export class UmnicoController {
  constructor(private readonly agent: UmnicoAgentService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook Umnico (гостевой AI-агент)' })
  webhook(@Body() body: UmnicoWebhook): { ok: true } {
    if (body?.type === 'message.incoming' && body.leadId != null) {
      const m = body.message ?? {};
      // Пропускаем исходящие (эхо наших ответов), если такой флаг придёт.
      if (!m.isOutgoing && m.direction !== 'outgoing') {
        const src = m.source;
        const source =
          typeof src === 'object' && src !== null
            ? (src.realId ?? (src.id != null ? String(src.id) : undefined))
            : src != null
              ? String(src)
              : m.saId != null
                ? String(m.saId)
                : undefined;
        const userId = m.userId != null ? String(m.userId) : m.user?.id != null ? String(m.user.id) : undefined;
        void this.agent.handleIncoming({
          leadId: String(body.leadId),
          source,
          userId,
          text: m.text ?? m.body ?? '',
        });
      }
    }
    return { ok: true };
  }
}
