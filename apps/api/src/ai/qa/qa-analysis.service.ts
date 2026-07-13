import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiConversationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { LlmPort } from '../llm/llm.port.js';
import { PiiMaskingService } from '../pii/pii-masking.service.js';
import { AiDirectoryService } from '../directory/ai-directory.service.js';
import { computeQaMetrics } from './qa-metrics.js';
import { QA_CRITERIA_KEYS, QA_SYSTEM_PROMPT } from './qa-prompts.js';

type QaSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

interface QaVerdict {
  overallScore: number | null;
  criteria: Record<string, number> | null;
  flags: string[];
  sentiment: QaSentiment | null;
  summary: string | null;
}

const EMPTY_VERDICT: QaVerdict = {
  overallScore: null,
  criteria: null,
  flags: [],
  sentiment: null,
  summary: null,
};

const ROLE_LABEL: Record<string, string> = { USER: 'Гость', ASSISTANT: 'AI', STAFF: 'Оператор' };

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

/** Разбирает JSON-вердикт модели устойчиво (срезает markdown/пояснения вокруг). */
export function parseQaVerdict(text: string): QaVerdict {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no json');
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const rc = (raw.criteria ?? {}) as Record<string, unknown>;
    const criteria: Record<string, number> = {};
    for (const k of QA_CRITERIA_KEYS) criteria[k] = clampInt(rc[k], 0, 10) ?? 0;
    const sentiment =
      raw.sentiment === 'POSITIVE' || raw.sentiment === 'NEUTRAL' || raw.sentiment === 'NEGATIVE'
        ? raw.sentiment
        : 'NEUTRAL';
    const flags = Array.isArray(raw.flags) ? raw.flags.map((f) => String(f)).slice(0, 20) : [];
    return {
      overallScore: clampInt(raw.overallScore, 0, 100),
      criteria,
      flags,
      sentiment,
      summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 1000) : null,
    };
  } catch {
    return { ...EMPTY_VERDICT, flags: ['qa_parse_error'] };
  }
}

/**
 * AI-аналитика и контроль качества чатов (§5.7). Считает детерминированные метрики
 * из таймлайна диалога и прогоняет LLM-скоринг по стандартам на МАСКИРОВАННОМ
 * транскрипте (§8). Один разбор на диалог (пере-прогон обновляет). Дашборд —
 * агрегаты по оператору/периоду.
 */
@Injectable()
export class QaAnalysisService {
  private readonly logger = new Logger('QaAnalysis');
  /** SLA первого ответа оператора, сек (позже — в настройки агента, §6 AiAgentConfig). */
  private readonly slaFirstResponseSec = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmPort,
    private readonly pii: PiiMaskingService,
    private readonly directory: AiDirectoryService,
  ) {}

  /** Добавляет к разборам имя оператора (батч-резолв id→имя). */
  private async withOperatorNames<T extends { operatorId: string | null }>(
    reviews: T[],
  ): Promise<Array<T & { operatorName: string | null }>> {
    const names = await this.directory.operators(reviews.map((r) => r.operatorId));
    return reviews.map((r) => ({
      ...r,
      operatorName: (r.operatorId && names.get(r.operatorId)) || null,
    }));
  }

  /** Разбирает один диалог: метрики + QA-скоринг; сохраняет/обновляет AiQaReview. */
  async analyze(conversationId: string) {
    const convo = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (!convo) throw new NotFoundException('Диалог не найден');

    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });

    const metrics = computeQaMetrics(
      {
        escalatedAt: convo.escalatedAt,
        assignedAt: convo.assignedAt,
        closedAt: convo.closedAt,
        messages,
      },
      this.slaFirstResponseSec,
    );

    const transcript = messages
      .filter((m) => ROLE_LABEL[m.role])
      .map((m) => `${ROLE_LABEL[m.role]}: ${m.content}`)
      .join('\n');

    let verdict = EMPTY_VERDICT;
    let model: string | null = null;
    if (transcript.trim().length > 0) {
      // ПДн маскируем перед отправкой в модель (§8) — гость мог написать ФИО/телефон в чат.
      const masked = this.pii.mask(transcript).masked;
      const res = await this.llm.complete({
        system: QA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Транскрипт диалога:\n\n${masked}` }],
        toolChoice: 'none',
        temperature: 0.2,
        tier: 'default',
      });
      verdict = parseQaVerdict(res.text);
      model = res.model;
    }

    const data = {
      operatorId: convo.operatorId,
      timeToPickupSec: metrics.timeToPickupSec,
      firstResponseSec: metrics.firstResponseSec,
      avgResponseSec: metrics.avgResponseSec,
      maxResponseSec: metrics.maxResponseSec,
      resolutionSec: metrics.resolutionSec,
      guestMsgCount: metrics.guestMsgCount,
      staffMsgCount: metrics.staffMsgCount,
      withinSla: metrics.withinSla,
      overallScore: verdict.overallScore,
      criteria: verdict.criteria ? (verdict.criteria as Prisma.InputJsonValue) : Prisma.JsonNull,
      flags: verdict.flags as unknown as Prisma.InputJsonValue,
      sentiment: verdict.sentiment,
      summary: verdict.summary,
      model,
    };

    const review = await this.prisma.aiQaReview.upsert({
      where: { conversationId },
      create: { tenantId: convo.tenantId, conversationId, ...data },
      update: { ...data, createdAt: new Date() },
    });
    return (await this.withOperatorNames([review]))[0];
  }

  /** Батч: разобрать диалоги, доходившие до человека и ещё без разбора. */
  async analyzePending(tenantId: string, limit = 20) {
    const pending = await this.prisma.aiConversation.findMany({
      where: {
        tenantId,
        status: { in: [AiConversationStatus.CLOSED, AiConversationStatus.ESCALATED] },
        qaReview: { is: null },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    let analyzed = 0;
    for (const c of pending) {
      try {
        await this.analyze(c.id);
        analyzed += 1;
      } catch (e) {
        this.logger.warn(`QA-разбор диалога ${c.id} не удался: ${(e as Error).message}`);
      }
    }
    return { requested: pending.length, analyzed };
  }

  async getReview(tenantId: string, conversationId: string) {
    const row = await this.prisma.aiQaReview.findFirst({ where: { tenantId, conversationId } });
    return row ? (await this.withOperatorNames([row]))[0] : null;
  }

  async listReviews(tenantId: string, opts: { operatorId?: string; limit?: number } = {}) {
    const rows = await this.prisma.aiQaReview.findMany({
      where: { tenantId, operatorId: opts.operatorId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 200),
    });
    return this.withOperatorNames(rows);
  }

  /** Агрегаты для дашборда качества (§5.7): баллы, времена, SLA, тональность, флаги, операторы. */
  async dashboard(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [reviews, convStats] = await Promise.all([
      this.prisma.aiQaReview.findMany({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.aiConversation.groupBy({
        by: ['status'],
        where: { tenantId, createdAt: { gte: since } },
        _count: true,
      }),
    ]);

    const avg = (nums: Array<number | null>): number | null => {
      const v = nums.filter((x): x is number => x != null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };

    const slaConsidered = reviews.filter((r) => r.withinSla != null);
    const slaOk = slaConsidered.filter((r) => r.withinSla).length;

    const sentiment: Record<QaSentiment, number> = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
    for (const r of reviews) {
      if (r.sentiment === 'POSITIVE' || r.sentiment === 'NEUTRAL' || r.sentiment === 'NEGATIVE') {
        sentiment[r.sentiment] += 1;
      }
    }

    const flagCounts: Record<string, number> = {};
    for (const r of reviews) {
      const fl = (r.flags as unknown as string[] | null) ?? [];
      if (Array.isArray(fl)) for (const f of fl) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
    }

    const opMap = new Map<
      string,
      { operatorId: string; overall: Array<number | null>; firstResp: Array<number | null> }
    >();
    for (const r of reviews) {
      const key = r.operatorId ?? '—';
      const o = opMap.get(key) ?? { operatorId: key, overall: [], firstResp: [] };
      o.overall.push(r.overallScore);
      o.firstResp.push(r.firstResponseSec);
      opMap.set(key, o);
    }

    const statusCount: Record<string, number> = {};
    let totalConv = 0;
    for (const s of convStats) {
      const c = typeof s._count === 'number' ? s._count : 0;
      statusCount[s.status] = c;
      totalConv += c;
    }
    const humanHandled = (statusCount.ESCALATED ?? 0) + (statusCount.CLOSED ?? 0);

    const opNames = await this.directory.operators([...opMap.keys()].filter((k) => k !== '—'));

    return {
      periodDays: days,
      reviewed: reviews.length,
      avgOverallScore: avg(reviews.map((r) => r.overallScore)),
      avgFirstResponseSec: avg(reviews.map((r) => r.firstResponseSec)),
      avgTimeToPickupSec: avg(reviews.map((r) => r.timeToPickupSec)),
      avgResponseSec: avg(reviews.map((r) => r.avgResponseSec)),
      avgResolutionSec: avg(reviews.map((r) => r.resolutionSec)),
      slaRate: slaConsidered.length ? Math.round((100 * slaOk) / slaConsidered.length) : null,
      sentiment,
      topFlags: Object.entries(flagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([flag, count]) => ({ flag, count })),
      byOperator: [...opMap.values()].map((o) => ({
        operatorId: o.operatorId,
        operatorName: o.operatorId === '—' ? null : (opNames.get(o.operatorId) ?? null),
        reviews: o.overall.length,
        avgOverallScore: avg(o.overall),
        avgFirstResponseSec: avg(o.firstResp),
      })),
      conversations: {
        total: totalConv,
        byStatus: statusCount,
        escalationRate: totalConv ? Math.round((100 * humanHandled) / totalConv) : null,
      },
    };
  }
}
