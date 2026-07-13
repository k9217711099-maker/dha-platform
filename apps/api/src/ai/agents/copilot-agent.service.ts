import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiActorKind, AiChannel, AiMessageRole } from '@prisma/client';
import { LlmPort } from '../llm/llm.port.js';
import type { LlmMessage, LlmToolCall } from '../llm/llm.types.js';
import { PiiMaskingService } from '../pii/pii-masking.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { CopilotToolRegistry } from '../tools/copilot-tool-registry.js';
import type { ToolContext } from '../tools/agent-tool.js';
import { COPILOT_SYSTEM_PROMPT } from './copilot-prompts.js';

export interface CopilotMessageInput {
  conversationId?: string;
  tenantId: string;
  employeeId: string;
  permissions: string[];
  text: string;
}

export interface CopilotDecision {
  toolCallId: string;
  allow: boolean;
  denyReason?: string;
}

export interface CopilotConfirmInput {
  conversationId: string;
  tenantId: string;
  employeeId: string;
  permissions: string[];
  decisions: CopilotDecision[];
}

/** Предложенное действие на запись, ожидающее подтверждения сотрудника. */
export interface CopilotPendingAction {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface CopilotResult {
  conversationId: string;
  reply: string;
  pending: CopilotPendingAction[];
}

/**
 * Копилот сотрудника (§3 ТЗ): советник + выполнение поручений в пределах прав роли.
 * Инструменты фильтруются по правам сотрудника (RBAC-гейтинг). Read-инструменты
 * выполняются сразу; write-инструменты (mutates) НЕ выполняются, а возвращаются как
 * pending — их подтверждает сотрудник (confirm). ПДн маскируются на границе с моделью.
 */
@Injectable()
export class CopilotAgentService {
  private readonly logger = new Logger('CopilotAgent');
  private readonly maxIterations = 6;

  constructor(
    private readonly llm: LlmPort,
    private readonly pii: PiiMaskingService,
    private readonly conversations: ConversationService,
    private readonly tools: CopilotToolRegistry,
  ) {}

  async handle(input: CopilotMessageInput): Promise<CopilotResult> {
    const convo =
      (input.conversationId ? await this.conversations.get(input.conversationId) : null) ??
      (await this.conversations.create({
        tenantId: input.tenantId,
        channel: AiChannel.ADMIN,
        actorKind: AiActorKind.STAFF,
        employeeId: input.employeeId,
      }));
    const ctx = this.ctxOf(convo.id, convo.tenantId, convo.employeeId ?? input.employeeId, input.permissions);
    // Незакрытые действия на запись, на которые сотрудник не ответил, считаем отклонёнными.
    await this.resolvePending(ctx, []);
    await this.conversations.addMessage(convo.id, { role: AiMessageRole.USER, content: input.text });
    return this.runLoop(ctx);
  }

  async confirm(input: CopilotConfirmInput): Promise<CopilotResult> {
    const convo = await this.conversations.get(input.conversationId);
    if (!convo) throw new NotFoundException('Диалог не найден');
    const ctx = this.ctxOf(convo.id, convo.tenantId, input.employeeId, input.permissions);
    await this.resolvePending(ctx, input.decisions);
    return this.runLoop(ctx);
  }

  private ctxOf(conversationId: string, tenantId: string, employeeId: string, permissions: string[]): ToolContext {
    return { actor: 'staff', conversationId, tenantId, employeeId, permissions };
  }

  /** Вызовы инструментов из последнего ответа модели, на которые ещё нет результата. */
  private async pendingCalls(conversationId: string): Promise<LlmToolCall[]> {
    const history = await this.conversations.history(conversationId);
    const resolved = new Set(
      history.filter((m) => m.role === 'tool' && m.toolCallId).map((m) => m.toolCallId),
    );
    let calls: LlmToolCall[] = [];
    for (const m of history) if (m.role === 'assistant' && m.toolCalls?.length) calls = m.toolCalls;
    return calls.filter((c) => !resolved.has(c.id));
  }

  /** Исполняет подтверждённые write-действия; отклонённые помечает как отклонённые. */
  private async resolvePending(ctx: ToolContext, decisions: CopilotDecision[]): Promise<void> {
    const pending = await this.pendingCalls(ctx.conversationId);
    for (const call of pending) {
      const decision = decisions.find((d) => d.toolCallId === call.id);
      if (decision?.allow) {
        const res = await this.tools.execute(call.name, call.arguments, ctx);
        await this.audit(ctx, call, { allowed: true, isError: res.isError ?? false, result: res.content });
        await this.conversations.addMessage(ctx.conversationId, {
          role: AiMessageRole.TOOL,
          content: res.content,
          toolName: call.name,
          toolCallId: call.id,
        });
      } else {
        const reason = decision?.denyReason ? ` Причина: ${decision.denyReason}` : '';
        await this.audit(ctx, call, { allowed: false, isError: false, result: 'declined' });
        await this.conversations.addMessage(ctx.conversationId, {
          role: AiMessageRole.TOOL,
          content: `Сотрудник отклонил действие.${reason}`,
          toolName: call.name,
          toolCallId: call.id,
        });
      }
    }
  }

  private async runLoop(ctx: ToolContext): Promise<CopilotResult> {
    const conversationId = ctx.conversationId;
    for (let i = 0; i < this.maxIterations; i++) {
      const history = await this.conversations.history(conversationId);
      const result = await this.llm.complete({
        system: COPILOT_SYSTEM_PROMPT,
        messages: this.maskForLlm(history),
        tools: this.tools.defs(ctx),
        toolChoice: 'auto',
      });
      await this.conversations.addMessage(conversationId, {
        role: AiMessageRole.ASSISTANT,
        content: result.text,
        toolCalls: result.toolCalls.length ? result.toolCalls : undefined,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        model: result.model,
      });
      if (result.toolCalls.length === 0) return { conversationId, reply: result.text, pending: [] };

      const pending: CopilotPendingAction[] = [];
      for (const call of result.toolCalls) {
        const tool = this.tools.get(call.name);
        if (tool?.mutates) {
          pending.push({ toolCallId: call.id, name: call.name, args: call.arguments });
          continue;
        }
        const res = await this.tools.execute(call.name, call.arguments, ctx);
        await this.audit(ctx, call, { allowed: true, isError: res.isError ?? false, result: res.content });
        await this.conversations.addMessage(conversationId, {
          role: AiMessageRole.TOOL,
          content: res.content,
          toolName: call.name,
          toolCallId: call.id,
        });
      }
      // Есть действия на запись — не выполняем, ждём подтверждения сотрудника.
      if (pending.length > 0) return { conversationId, reply: result.text, pending };
      // Иначе (только read) — продолжаем цикл.
    }
    this.logger.warn(`Копилот ${conversationId}: достигнут предел итераций.`);
    return {
      conversationId,
      reply: 'Не удалось завершить за отведённые шаги — уточните запрос, пожалуйста.',
      pending: [],
    };
  }

  private audit(
    ctx: ToolContext,
    call: LlmToolCall,
    opts: { allowed: boolean; isError: boolean; result: string },
  ) {
    return this.conversations.addToolAudit({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      actorKind: AiActorKind.STAFF,
      employeeId: ctx.employeeId,
      toolName: call.name,
      argsRedacted: call.arguments,
      allowed: opts.allowed,
      isError: opts.isError,
      result: opts.result.slice(0, 2000),
    });
  }

  private maskForLlm(messages: LlmMessage[]): LlmMessage[] {
    return messages.map((m) =>
      m.role === 'user' ? { ...m, content: this.pii.mask(m.content).masked } : m,
    );
  }
}
