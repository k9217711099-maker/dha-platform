import { describe, it, expect, vi } from 'vitest';
import { QaAnalysisService, parseQaVerdict } from './qa-analysis.service.js';
import { PiiMaskingService } from '../pii/pii-masking.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AiDirectoryService } from '../directory/ai-directory.service.js';
import type { LlmPort } from '../llm/llm.port.js';
import type { LlmCompletionRequest } from '../llm/llm.types.js';

const fakeDirectory = () =>
  ({
    operators: vi.fn(async () => new Map<string, string>()),
    guests: vi.fn(async () => new Map<string, string>()),
  }) as unknown as AiDirectoryService;

const base = new Date('2026-07-09T10:00:00Z').getTime();
const at = (sec: number) => new Date(base + sec * 1000);

const VERDICT_JSON =
  '{"overallScore":82,"criteria":{"greeting":9,"politeness":8,"completeness":7,"compliance":8,"upsell":10,"escalation":9,"respect":10,"pii":9},"flags":["долгий ответ"],"sentiment":"POSITIVE","summary":"Оператор вежлив, но ответил не сразу."}';

function scriptedLlm(text: string) {
  const requests: LlmCompletionRequest[] = [];
  const llm: LlmPort = {
    async complete(req: LlmCompletionRequest) {
      requests.push(req);
      return {
        text,
        toolCalls: [],
        finishReason: 'stop',
        model: 'deepseek-test',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
  };
  return { llm, requests };
}

function fakePrisma(convo: Record<string, unknown>, messages: Array<Record<string, unknown>>) {
  const upsert = vi.fn(async (args: { where: unknown; create: Record<string, unknown> }) => ({
    id: 'r1',
    ...args.create,
  }));
  const prisma = {
    aiConversation: { findUnique: vi.fn(async () => convo) },
    aiMessage: { findMany: vi.fn(async () => messages) },
    aiQaReview: { upsert },
  } as unknown as PrismaService;
  return { prisma, upsert };
}

describe('QaAnalysisService.analyze', () => {
  it('маскирует ПДн перед моделью, сохраняет метрики и разобранный вердикт', async () => {
    const convo = {
      id: 'c1',
      tenantId: 't1',
      operatorId: 'op1',
      escalatedAt: at(60),
      assignedAt: at(90),
      closedAt: at(600),
    };
    const messages = [
      { role: 'USER', content: 'Здравствуйте, я Иван, тел +7 921 000-11-22', createdAt: at(0) },
      { role: 'STAFF', content: 'Здравствуйте! Помогу вам с бронированием.', createdAt: at(120) },
    ];
    const { prisma, upsert } = fakePrisma(convo, messages);
    const { llm, requests } = scriptedLlm(VERDICT_JSON);
    const svc = new QaAnalysisService(prisma, llm, new PiiMaskingService(), fakeDirectory());

    await svc.analyze('c1');

    // ПДн замаскированы на границе с моделью
    const sent = requests[0]?.messages[0]?.content ?? '';
    expect(sent).toContain('[PHONE_1]');
    expect(sent).not.toContain('921');
    expect(sent).toContain('Оператор:'); // транскрипт помечает роли

    const arg = upsert.mock.calls[0]![0] as { where: { conversationId: string }; create: Record<string, unknown> };
    expect(arg.where.conversationId).toBe('c1');
    expect(arg.create.tenantId).toBe('t1');
    expect(arg.create.operatorId).toBe('op1');
    expect(arg.create.overallScore).toBe(82);
    expect(arg.create.sentiment).toBe('POSITIVE');
    expect(arg.create.model).toBe('deepseek-test');
    // метрики: first response = 120 − 60 = 60 c; счётчики
    expect(arg.create.firstResponseSec).toBe(60);
    expect(arg.create.guestMsgCount).toBe(1);
    expect(arg.create.staffMsgCount).toBe(1);
  });

  it('пустой транскрипт (нет реплик) — модель не зовётся', async () => {
    const convo = { id: 'c2', tenantId: 't1', operatorId: null, escalatedAt: null, assignedAt: null, closedAt: null };
    const { prisma, upsert } = fakePrisma(convo, []);
    const { llm, requests } = scriptedLlm(VERDICT_JSON);
    const svc = new QaAnalysisService(prisma, llm, new PiiMaskingService(), fakeDirectory());

    await svc.analyze('c2');

    expect(requests).toHaveLength(0);
    expect(upsert.mock.calls[0]![0].create.overallScore).toBeNull();
  });
});

describe('parseQaVerdict', () => {
  it('парсит чистый JSON и клампит баллы', () => {
    const v = parseQaVerdict('{"overallScore":150,"criteria":{"greeting":20},"flags":["грубость"],"sentiment":"NEGATIVE","summary":"плохо"}');
    expect(v.overallScore).toBe(100); // кламп 0..100
    expect(v.criteria?.greeting).toBe(10); // кламп 0..10
    expect(v.flags).toEqual(['грубость']);
    expect(v.sentiment).toBe('NEGATIVE');
  });

  it('срезает markdown-обёртку ```json', () => {
    const v = parseQaVerdict('```json\n{"overallScore":70,"sentiment":"NEUTRAL"}\n```');
    expect(v.overallScore).toBe(70);
    expect(v.sentiment).toBe('NEUTRAL');
    expect(v.criteria?.politeness).toBe(0); // недостающие критерии → 0
  });

  it('мусор → флаг ошибки разбора, без падения', () => {
    const v = parseQaVerdict('извините, не смог оценить');
    expect(v.overallScore).toBeNull();
    expect(v.flags).toContain('qa_parse_error');
  });
});
