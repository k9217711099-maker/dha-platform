import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { asString } from '../tool-args.util.js';
import { KbService } from '../../../kb/kb.service.js';

/**
 * Поиск по базе знаний (§4.5/§5.4 ТЗ) — переиспользует KbService (полнотекстовый
 * поиск). Общий для гостевого агента и копилота. Безопасность: у KB нет флага
 * видимости, поэтому ГОСТЮ отдаём только базы из белого списка KB_GUEST_BASE_IDS
 * (пусто → гостю KB выключен); СОТРУДНИК ищет по всей базе.
 */
@Injectable()
export class KbSearchTool extends AgentTool {
  readonly name = 'kb_search';
  readonly description =
    'Поиск ответа в базе знаний отеля: правила проживания, услуги, условия бронирования, вопросы о районе. Вызывай, когда спрашивают о правилах/услугах/условиях.';
  readonly parameters = {
    type: 'object',
    properties: { query: { type: 'string', description: 'Суть вопроса' } },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(
    private readonly kb: KbService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = asString(args.query);
    if (!query) return { content: 'Уточните, что именно нужно найти.', isError: true };

    let hits = await this.kb.search(ctx.tenantId, query);

    if (ctx.actor === 'guest') {
      // Гостю доступны: страницы, явно помеченные «доступна гостевому агенту»
      // (флаг guestAgentVisible, чекбокс в /kb — KB-DRIVE-TZ.md §4.3), плюс целые
      // базы из белого списка KB_GUEST_BASE_IDS (env, опционально).
      const allowed = this.config.get('KB_GUEST_BASE_IDS', { infer: true });
      const flagged = await this.kb.filterGuestVisible(ctx.tenantId, hits);
      const flaggedIds = new Set(flagged.map((h) => h.id));
      const byBase = allowed.length > 0 ? hits.filter((h) => allowed.includes(h.baseId) && !flaggedIds.has(h.id)) : [];
      hits = [...flagged, ...byBase];
      if (hits.length === 0) {
        const configured = allowed.length > 0 || (await this.kb.hasGuestVisiblePages(ctx.tenantId));
        if (!configured) {
          return {
            content:
              'База знаний для гостей ещё не настроена. Ответь из общих сведений об отеле или предложи уточнить у администратора.',
          };
        }
      }
    }

    if (hits.length === 0) {
      return {
        content: `По запросу «${query}» в базе знаний ничего не нашлось. Ответь общими словами или предложи уточнить у администратора.`,
      };
    }

    const top = hits.slice(0, 5).map((h) => {
      const snippet = h.snippet.replace(/<\/?mark>/g, '').trim();
      return `• ${h.title}: ${snippet}`;
    });
    return { content: `Из базы знаний:\n${top.join('\n')}`, data: { count: hits.length } };
  }
}
