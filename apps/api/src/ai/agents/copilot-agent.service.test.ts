import { describe, it, expect, vi } from 'vitest';
import { CopilotAgentService } from './copilot-agent.service.js';
import { PiiMaskingService } from '../pii/pii-masking.service.js';
import { CopilotToolRegistry } from '../tools/copilot-tool-registry.js';
import { AgentTool, type ToolContext, type ToolResult } from '../tools/agent-tool.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { LlmPort } from '../llm/llm.port.js';
import type { LlmCompletionRequest, LlmCompletionResult } from '../llm/llm.types.js';

const ROLE_MAP: Record<string, string> = { USER: 'user', ASSISTANT: 'assistant', TOOL: 'tool', SYSTEM: 'system' };

function fakeConversations() {
  const convos = new Map<string, Record<string, unknown>>();
  const messages: Array<Record<string, unknown>> = [];
  let seq = 0;
  const svc = {
    create: vi.fn(async (input: Record<string, unknown>) => {
      const c = { id: `c${++seq}`, status: 'BOT', guestId: null, employeeId: null, ...input };
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
      messages.push({ conversationId: cid, ...input });
    }),
    setStatus: vi.fn(),
    addToolAudit: vi.fn(),
  };
  return { svc };
}

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
        finishReason: 'stop',
        model: 'test',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
  };
  return { llm, requests };
}

class FakeReadTool extends AgentTool {
  readonly name = 'find_booking';
  readonly description = 'поиск брони';
  override readonly requiredPermission = 'pms_bookings';
  readonly parameters: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false };
  executed = 0;
  async execute(): Promise<ToolResult> {
    this.executed += 1;
    return { content: 'Найдена бронь #DHA-1' };
  }
}

class FakeWriteTool extends AgentTool {
  readonly name = 'add_booking_note';
  readonly description = 'заметка к брони';
  override readonly requiredPermission = 'pms_bookings';
  override readonly mutates = true;
  readonly parameters: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false };
  executed = 0;
  async execute(): Promise<ToolResult> {
    this.executed += 1;
    return { content: 'Заметка добавлена.' };
  }
}

const staffCtx: ToolContext = { actor: 'staff', conversationId: 'x', tenantId: 't1', permissions: ['pms_bookings'] };

describe('CopilotToolRegistry (RBAC-гейтинг)', () => {
  it('скрывает инструменты без нужного права', () => {
    const registry = new CopilotToolRegistry([new FakeReadTool(), new FakeWriteTool()]);
    expect(registry.defs({ ...staffCtx, permissions: [] })).toHaveLength(0);
    expect(registry.defs(staffCtx)).toHaveLength(2);
  });
});

describe('CopilotAgentService', () => {
  it('read-инструмент выполняется сразу и ведёт к финальному ответу', async () => {
    const { svc } = fakeConversations();
    const read = new FakeReadTool();
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: 'r1', name: 'find_booking', arguments: { query: 'DHA-1' } }] },
      { text: 'Нашёл бронь #DHA-1.' },
    ]);
    const agent = new CopilotAgentService(
      llm,
      new PiiMaskingService(),
      svc as unknown as ConversationService,
      new CopilotToolRegistry([read]),
    );
    const res = await agent.handle({ tenantId: 't1', employeeId: 'e1', permissions: ['pms_bookings'], text: 'найди бронь DHA-1' });
    expect(read.executed).toBe(1);
    expect(res.reply).toContain('DHA-1');
    expect(res.pending).toHaveLength(0);
  });

  it('write-инструмент НЕ выполняется без подтверждения; confirm(allow) выполняет', async () => {
    const { svc } = fakeConversations();
    const write = new FakeWriteTool();
    const { llm } = scriptedLlm([
      { text: 'Добавлю заметку к брони.', toolCalls: [{ id: 'w1', name: 'add_booking_note', arguments: { bookingNumber: 'DHA-1', note: 'VIP' } }] },
      { text: 'Готово — заметка добавлена.' },
    ]);
    const agent = new CopilotAgentService(
      llm,
      new PiiMaskingService(),
      svc as unknown as ConversationService,
      new CopilotToolRegistry([write]),
    );

    const first = await agent.handle({ tenantId: 't1', employeeId: 'e1', permissions: ['pms_bookings'], text: 'добавь заметку VIP к DHA-1' });
    expect(first.pending).toHaveLength(1);
    expect(first.pending[0]?.name).toBe('add_booking_note');
    expect(write.executed).toBe(0); // без подтверждения не выполнено

    const second = await agent.confirm({
      conversationId: first.conversationId,
      tenantId: 't1',
      employeeId: 'e1',
      permissions: ['pms_bookings'],
      decisions: [{ toolCallId: 'w1', allow: true }],
    });
    expect(write.executed).toBe(1);
    expect(second.reply).toContain('Готово');
    expect(second.pending).toHaveLength(0);
  });

  it('confirm(deny) не выполняет действие', async () => {
    const { svc } = fakeConversations();
    const write = new FakeWriteTool();
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: 'w1', name: 'add_booking_note', arguments: {} }] },
      { text: 'Хорошо, не буду.' },
    ]);
    const agent = new CopilotAgentService(
      llm,
      new PiiMaskingService(),
      svc as unknown as ConversationService,
      new CopilotToolRegistry([write]),
    );
    const first = await agent.handle({ tenantId: 't1', employeeId: 'e1', permissions: ['pms_bookings'], text: 'заметка' });
    await agent.confirm({
      conversationId: first.conversationId,
      tenantId: 't1',
      employeeId: 'e1',
      permissions: ['pms_bookings'],
      decisions: [{ toolCallId: 'w1', allow: false, denyReason: 'не нужно' }],
    });
    expect(write.executed).toBe(0);
  });
});
