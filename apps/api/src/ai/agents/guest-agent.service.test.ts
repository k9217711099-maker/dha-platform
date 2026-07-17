import { describe, it, expect, vi } from 'vitest';
import { AiChannel } from '@prisma/client';
import { GuestAgentService } from './guest-agent.service.js';
import { PiiMaskingService } from '../pii/pii-masking.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { EscalateTool } from '../tools/guest/escalate.tool.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { LlmPort } from '../llm/llm.port.js';
import type { LlmCompletionRequest, LlmCompletionResult } from '../llm/llm.types.js';

const ROLE_MAP: Record<string, string> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
  SYSTEM: 'system',
};

/** In-memory реализация ConversationService для теста агентного цикла. */
function fakeConversations() {
  const convos = new Map<string, Record<string, unknown>>();
  const messages: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  let seq = 0;
  const svc = {
    create: vi.fn(async (input: Record<string, unknown>) => {
      const c = { id: `c${++seq}`, status: 'BOT', guestId: null, ...input };
      convos.set(c.id as string, c);
      return c;
    }),
    get: vi.fn(async (id: string) => convos.get(id) ?? null),
    history: vi.fn(async (cid: string) =>
      messages
        .filter((m) => m.conversationId === cid)
        .map((m) => ({
          role: ROLE_MAP[m.role as string],
          content: m.content,
          toolCalls: m.role === 'ASSISTANT' ? m.toolCalls : undefined,
          toolCallId: m.toolCallId,
          name: m.toolName,
        })),
    ),
    addMessage: vi.fn(async (cid: string, input: Record<string, unknown>) => {
      const m = { conversationId: cid, ...input };
      messages.push(m);
      return m;
    }),
    setStatus: vi.fn(async (id: string, status: string) => {
      const c = convos.get(id);
      if (c) c.status = status;
      return c;
    }),
    addToolAudit: vi.fn(async (input: Record<string, unknown>) => {
      audits.push(input);
      return input;
    }),
  };
  return { svc, messages, audits };
}

/** LLM, отдающий заранее заготовленные ответы по очереди. */
function scriptedLlm(responses: Array<Partial<LlmCompletionResult>>) {
  const requests: LlmCompletionRequest[] = [];
  let i = 0;
  const llm: LlmPort = {
    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
      requests.push(req);
      const r = responses[Math.min(i, responses.length - 1)] ?? {};
      i += 1;
      return {
        text: r.text ?? '',
        toolCalls: r.toolCalls ?? [],
        finishReason: r.finishReason ?? 'stop',
        model: r.model ?? 'test',
        usage: r.usage ?? { inputTokens: 0, outputTokens: 0 },
      };
    },
  };
  return { llm, requests };
}

describe('GuestAgentService', () => {
  it('маскирует ПДн гостя перед отправкой в модель и отвечает', async () => {
    const { svc } = fakeConversations();
    const { llm, requests } = scriptedLlm([{ text: 'Здравствуйте! Чем могу помочь? 🙂' }]);
    const agent = new GuestAgentService(
      llm,
      new PiiMaskingService(),
      svc as unknown as ConversationService,
      new ToolRegistry([]),
      { get: async () => null } as unknown as import('../../common/settings/settings.service.js').SettingsService,
    );

    const res = await agent.handle({
      tenantId: 't1',
      channel: AiChannel.WEB,
      text: 'Здравствуйте, я Иван, тел +7 921 000-11-22',
    });

    expect(res.reply).toContain('Здравствуйте');
    expect(res.escalated).toBe(false);
    const sentUser = requests[0]?.messages.find((m) => m.role === 'user');
    expect(sentUser?.content).toContain('[PHONE_1]');
    expect(sentUser?.content).not.toContain('921');
  });

  it('эскалирует, когда модель вызывает escalate_to_admin', async () => {
    const { svc } = fakeConversations();
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: 'tc1', name: 'escalate_to_admin', arguments: { reason: 'возврат' } }] },
      { text: 'Подключаю администратора — коллега скоро ответит.' },
    ]);
    const escalate = new EscalateTool(svc as unknown as ConversationService);
    const agent = new GuestAgentService(
      llm,
      new PiiMaskingService(),
      svc as unknown as ConversationService,
      new ToolRegistry([escalate]),
      { get: async () => null } as unknown as import('../../common/settings/settings.service.js').SettingsService,
    );

    const res = await agent.handle({
      tenantId: 't1',
      channel: AiChannel.WEB,
      text: 'Хочу вернуть деньги за бронь',
    });

    expect(res.escalated).toBe(true);
    expect(res.reply).toContain('администратора');
    expect(svc.setStatus).toHaveBeenCalledWith(expect.any(String), 'ESCALATED');
  });

  it('в статусе ESCALATED не зовёт модель — копит сообщение для оператора', async () => {
    const convo = { id: 'esc1', status: 'ESCALATED', tenantId: 't1', guestId: null };
    const conversations = {
      get: vi.fn().mockResolvedValue(convo),
      create: vi.fn(),
      history: vi.fn(),
      addMessage: vi.fn(),
      setStatus: vi.fn(),
      addToolAudit: vi.fn(),
    } as unknown as ConversationService;
    const { llm, requests } = scriptedLlm([{ text: 'не должно вызваться' }]);
    const agent = new GuestAgentService(
      llm,
      new PiiMaskingService(),
      conversations,
      new ToolRegistry([]),
      { get: async () => null } as unknown as import('../../common/settings/settings.service.js').SettingsService,
    );
    const res = await agent.handle({
      conversationId: 'esc1',
      tenantId: 't1',
      channel: AiChannel.WEB,
      text: 'ещё вопрос',
    });
    expect(requests).toHaveLength(0);
    expect(res.escalated).toBe(true);
    expect(res.reply).toContain('администратору');
    expect(conversations.addMessage).toHaveBeenCalled();
  });
});
