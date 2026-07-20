import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UmnicoAgentService } from './umnico-agent.service.js';

/**
 * Вебхук Umnico (событие message.incoming). Схема по офиц. документации:
 * https://api.umnico.com/docs/ru/apiMethods/events.html + history.html.
 * В корне: type, accountId, leadId, isNewLead, isNewCustomer, message.
 * В message: text, incoming (true=входящее), source{realId,saId,type}, sender{id,customerId}.
 */
interface UmnicoWebhook {
  type?: string;
  event?: string;
  accountId?: number;
  leadId?: number | string;
  isNewLead?: boolean;
  isNewCustomer?: boolean;
  message?: {
    text?: string;
    body?: string;
    content?: string;
    incoming?: boolean;
    direction?: string;
    source?: { realId?: string | number; saId?: number | string; type?: string };
    sender?: { id?: number | string; customerId?: number | string; login?: string; type?: string };
    sa?: { id?: number | string; type?: string; login?: string };
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
  private readonly logger = new Logger('UmnicoWebhook');

  constructor(private readonly agent: UmnicoAgentService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook Umnico (гостевой AI-агент)' })
  webhook(@Body() body: UmnicoWebhook): { ok: true } {
    const evt = body?.type ?? body?.event ?? '—';
    const m = body?.message ?? {};
    const text = String(m.text ?? m.body ?? m.content ?? '').trim();
    const isIncoming = m.incoming !== false && m.direction !== 'outgoing';
    // ВРЕМЕННО (диагностика): сырой payload на уровне error — info/warn на проде подавлены.
    this.logger.error(
      `[UMNICO RAW] evt=${evt} leadId=${body?.leadId ?? '—'} hasText=${!!text} incoming=${isIncoming} body=${JSON.stringify(body ?? {}).slice(0, 1500)}`,
    );
    // Обрабатываем как входящее, если есть обращение (leadId), текст и это не исходящее.
    // Не завязываемся строго на type='message.incoming' — Umnico может звать событие иначе.
    if (body?.leadId != null && text && isIncoming) {
      const src = m.source;
      const source =
        src?.realId != null ? String(src.realId) : src?.saId != null ? String(src.saId) : undefined;
      const saId = src?.saId != null ? String(src.saId) : m.sa?.id != null ? String(m.sa.id) : undefined;
      const userId =
        m.sender?.id != null
          ? String(m.sender.id)
          : m.sender?.customerId != null
            ? String(m.sender.customerId)
            : undefined;
      void this.agent.handleIncoming({ leadId: String(body.leadId), source, userId, saId, text });
    } else {
      this.logger.error(
        `[UMNICO SKIP] evt=${evt} leadId=${body?.leadId ?? '—'} hasText=${!!text} incoming=${isIncoming}`,
      );
    }
    return { ok: true };
  }
}
