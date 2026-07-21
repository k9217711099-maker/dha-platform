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
  /** Телефон гостя может прийти на верхнем уровне (в разных каналах Umnico по-разному). */
  phone?: string;
  customer?: { phone?: string; name?: string };
  contact?: { phone?: string };
  message?: {
    text?: string;
    body?: string;
    content?: string;
    /** Реальное место текста/вложений события message.incoming: message.message.*. */
    message?: {
      text?: string;
      attachments?: Array<{ type?: string; url?: string; link?: string; src?: string; name?: string }>;
    };
    incoming?: boolean;
    direction?: string;
    source?: {
      realId?: string | number;
      saId?: number | string;
      id?: string | number;
      type?: string;
      identifier?: string;
    };
    sender?: {
      id?: number | string;
      customerId?: number | string;
      login?: string;
      phone?: string;
      type?: string;
    };
    sa?: { id?: number | string; type?: string; login?: string };
  };
}

/** Первый кандидат, похожий на телефон (≥10 цифр). Форматы каналов различаются. */
function pickPhone(...vals: Array<unknown>): string | undefined {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s.replace(/\D/g, '').length >= 10) return s;
  }
  return undefined;
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
    // Текст события message.incoming лежит в message.message.text (проверено на боевом
    // payload Umnico); запасные варианты — на случай других типов каналов.
    const realText = String(m.message?.text ?? m.text ?? m.body ?? m.content ?? '').trim();
    // Вложения (картинки/файлы) — в message.message.attachments. Картинки помечаем
    // маркером `[img]<url>` (админка рисует их как <img>), прочие типы — ссылкой.
    // Работает и с подписью (caption), и с несколькими вложениями.
    const atts = Array.isArray(m.message?.attachments) ? m.message.attachments : [];
    let text = realText;
    for (const a of atts) {
      const url = a?.url ?? a?.link ?? a?.src;
      const isImage = /photo|image|picture/i.test(a?.type ?? '');
      const marker = url
        ? isImage
          ? `[img]${url}`
          : `[вложение${a?.type ? `: ${a.type}` : ''}]\n${url}`
        : `[вложение${a?.type ? `: ${a.type}` : ''}]`;
      text = text ? `${text}\n${marker}` : marker;
    }
    const isIncoming = m.incoming !== false && m.direction !== 'outgoing';
    // Обрабатываем как входящее, если есть обращение (leadId), текст и это не исходящее.
    // На точное имя type не завязываемся (Umnico шлёт ещё lead.changed и т.п. — их пропускаем).
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
      // Тип подканала Umnico (whatsapp/telegram/vk/avito…) — чтобы показать оператору,
      // откуда именно пишет гость (#14).
      const sourceType = src?.type != null ? String(src.type) : undefined;
      // Телефон гостя (если канал его отдаёт) — защитно из нескольких мест: у WhatsApp/SMS
      // это обычно login отправителя; плюс верхнеуровневые customer/contact/phone.
      const phone = pickPhone(
        m.sender?.phone,
        m.sender?.login,
        m.source?.identifier,
        body.customer?.phone,
        body.contact?.phone,
        body.phone,
      );
      void this.agent.handleIncoming({ leadId: String(body.leadId), source, userId, saId, phone, sourceType, text });
    } else if (/message\.incoming/i.test(evt)) {
      // message.incoming без текста и без распознанного вложения — просто отметим (warn
      // на проде подавлен, спама не будет; поднять уровень при разборе новых типов медиа).
      this.logger.warn(`[UMNICO] message.incoming без текста/вложений: leadId=${body?.leadId ?? '—'}`);
    }
    return { ok: true };
  }
}
