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
  accountId?: number;
  leadId?: number | string;
  isNewLead?: boolean;
  isNewCustomer?: boolean;
  message?: {
    text?: string;
    incoming?: boolean;
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
    // Диагностика: фиксируем сам факт вызова и форму события. Если в логах пусто —
    // значит Umnico не шлёт к нам (не прописан URL вебхука в кабинете Umnico).
    this.logger.log(
      `hit type=${body?.type ?? '—'} leadId=${body?.leadId ?? '—'} keys=[${Object.keys(body ?? {}).join(',')}]`,
    );
    if (body?.type === 'message.incoming' && body.leadId != null) {
      const m = body.message ?? {};
      // incoming === false → исходящее (эхо нашего ответа), не обрабатываем.
      if (m.incoming !== false) {
        const src = m.source;
        // source для ответа = source.realId (обяз. в Umnico), запас — saId.
        const source =
          src?.realId != null ? String(src.realId) : src?.saId != null ? String(src.saId) : undefined;
        const saId = src?.saId != null ? String(src.saId) : m.sa?.id != null ? String(m.sa.id) : undefined;
        // userId — идентификатор клиента (sender.id / customerId).
        const userId =
          m.sender?.id != null
            ? String(m.sender.id)
            : m.sender?.customerId != null
              ? String(m.sender.customerId)
              : undefined;
        void this.agent.handleIncoming({
          leadId: String(body.leadId),
          source,
          userId,
          saId,
          text: m.text ?? '',
        });
      } else {
        this.logger.log(`пропущено исходящее (incoming=false) leadId=${body.leadId}`);
      }
    } else {
      this.logger.warn(
        `не распознано как message.incoming (type=${body?.type ?? '—'}) — событие проигнорировано`,
      );
    }
    return { ok: true };
  }
}
