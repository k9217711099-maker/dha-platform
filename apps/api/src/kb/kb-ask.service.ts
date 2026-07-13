import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { LlmPort } from '../ai/llm/llm.port.js';
import { PiiMaskingService } from '../ai/pii/pii-masking.service.js';
import type { AclActor } from '../acl/acl.service.js';
import { KbService } from './kb.service.js';

export interface KbAskSource {
  n: number;
  pageId: string;
  title: string;
  shortId: string;
}

export interface KbAskResult {
  answer: string;
  sources: KbAskSource[];
  /** Модель не нашла ответа в базе (честное «не знаю», ТЗ §4.3). */
  noAnswer: boolean;
  model: string;
}

/** Сколько страниц-кандидатов отдаём модели и сколько текста с каждой. */
const TOP_PAGES = 5;
const PAGE_CHARS = 2600;

const SYSTEM_PROMPT = `Ты — помощник по внутренней базе знаний сети отелей D Hotels & Apartments.
Тебе дан вопрос сотрудника и фрагменты страниц базы знаний, пронумерованные [1], [2], …

Правила:
- Отвечай ТОЛЬКО на основе приведённых фрагментов. Ничего не выдумывай.
- После каждого утверждения ставь номер источника в квадратных скобках, например [2].
- Если во фрагментах нет ответа на вопрос — ответь ровно одной строкой: НЕТ_ОТВЕТА
- Отвечай по-русски, кратко и по делу: сотрудник спешит. Списки — маркированные.`;

/**
 * «Спросить базу знаний» (KB-DRIVE-TZ.md §4.3): ретрив текущим поиском (FTS/ILIKE),
 * ответ через LlmPort с цитатами-ссылками. Векторный ретрив (pgvector) подключится
 * позже тем же контуром — интерфейс ответа не изменится.
 * ПДн: наружу (DeepSeek, трансграничная передача) текст уходит только после
 * PiiMaskingService (AI-COMMUNICATIONS-TZ.md §8).
 */
@Injectable()
export class KbAskService {
  private readonly log = new Logger(KbAskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kb: KbService,
    private readonly llm: LlmPort,
    private readonly pii: PiiMaskingService,
  ) {}

  async ask(tenantId: string, question: string, actor?: AclActor): Promise<KbAskResult> {
    const q = question?.trim();
    if (!q) throw new BadRequestException('Пустой вопрос');
    if (q.length > 500) throw new BadRequestException('Слишком длинный вопрос (до 500 символов)');

    // ACL применяется на ретриве: в модель не попадёт ни строчки из закрытых страниц (§1.4).
    // Слабые хиты (OR-ослабление, совпала часть слов) в LLM не отдаём — экономим токены
    // и не провоцируем модель отвечать по нерелевантным фрагментам.
    const hits = (await this.kb.search(tenantId, q, actor)).filter((h) => !h.weak).slice(0, TOP_PAGES);
    if (hits.length === 0) {
      return { answer: 'В базе знаний ответа на этот вопрос нет.', sources: [], noAnswer: true, model: 'retrieval' };
    }

    const pages = await this.prisma.kbPage.findMany({
      where: { tenantId, id: { in: hits.map((h) => h.id) } },
      select: { id: true, title: true, shortId: true, searchText: true },
    });
    const byId = new Map(pages.map((p) => [p.id, p]));
    const sources: KbAskSource[] = [];
    const fragments: string[] = [];
    for (const h of hits) {
      const p = byId.get(h.id);
      if (!p) continue;
      const n = sources.length + 1;
      sources.push({ n, pageId: p.id, title: p.title, shortId: p.shortId });
      fragments.push(`[${n}] «${p.title}»\n${p.searchText.slice(0, PAGE_CHARS)}`);
    }

    // Маскирование ПДн перед отправкой во внешнюю модель; ответ размаскируем той же картой
    const masked = this.pii.mask(`Вопрос сотрудника: ${q}\n\nФрагменты базы знаний:\n\n${fragments.join('\n\n---\n\n')}`);
    const result = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: masked.masked }],
      tier: 'default',
      temperature: 0.2,
      maxTokens: 900,
    });
    const answer = this.pii.unmask(result.text, masked.map).trim();
    this.log.debug(`kb/ask "${q.slice(0, 60)}" → ${result.model}, ${result.usage.outputTokens} ток.`);

    if (/^НЕТ_ОТВЕТА\.?$/m.test(answer)) {
      return { answer: 'В базе знаний ответа на этот вопрос нет.', sources: [], noAnswer: true, model: result.model };
    }
    // Оставляем в источниках только те, на которые модель реально сослалась (если ссылки есть)
    const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    const usedSources = cited.size > 0 ? sources.filter((s) => cited.has(s.n)) : sources;
    return { answer, sources: usedSources, noAnswer: false, model: result.model };
  }
}
