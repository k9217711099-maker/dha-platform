import { Injectable } from '@nestjs/common';
import { AiActorKind, AiChannel, AiConversationStatus, AiMessageRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { LlmMessage, LlmRole, LlmToolCall } from '../llm/llm.types.js';

export interface CreateConversationInput {
  tenantId: string;
  channel: AiChannel;
  actorKind: AiActorKind;
  guestId?: string;
  employeeId?: string;
}

export interface AddMessageInput {
  role: AiMessageRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
}

export interface AddToolAuditInput {
  tenantId?: string;
  conversationId?: string;
  actorKind: AiActorKind;
  guestId?: string;
  employeeId?: string;
  toolName: string;
  argsRedacted?: Record<string, unknown>;
  allowed?: boolean;
  isError?: boolean;
  result?: string;
}

const ROLE_TO_LLM: Record<AiMessageRole, LlmRole> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  STAFF: 'assistant', // ответ оператора — для модели как assistant-ход, если диалог возобновят
  TOOL: 'tool',
  SYSTEM: 'system',
};

/** Персистентность диалогов AI (история в нашей БД — API модели stateless, §4.9). */
@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateConversationInput) {
    return this.prisma.aiConversation.create({
      data: {
        tenantId: input.tenantId,
        channel: input.channel,
        actorKind: input.actorKind,
        guestId: input.guestId,
        employeeId: input.employeeId,
      },
    });
  }

  get(id: string) {
    return this.prisma.aiConversation.findUnique({ where: { id } });
  }

  /** Найти диалог по внешнему ID чата (напр. Telegram chat id). */
  findByExternal(tenantId: string, channel: AiChannel, externalId: string) {
    return this.prisma.aiConversation.findFirst({ where: { tenantId, channel, externalId } });
  }

  setExternalId(id: string, externalId: string) {
    return this.prisma.aiConversation.update({ where: { id }, data: { externalId } });
  }

  /** Привязать существующий диалог к гостю (напр. после Telegram deep-link §13). */
  setGuestId(id: string, guestId: string) {
    return this.prisma.aiConversation.update({ where: { id }, data: { guestId } });
  }

  /**
   * Сообщения диалога для показа. Гостю — только user/ai/staff (по умолчанию).
   * Оператору (`includeSystem`) — плюс SYSTEM-заметки (напр. лог делегирования §4.8),
   * которые гость не видит. TOOL-сообщения скрыты всегда.
   */
  async threadView(
    conversationId: string,
    opts: { includeSystem?: boolean } = {},
  ): Promise<Array<{ role: 'user' | 'ai' | 'staff' | 'system'; text: string; createdAt: Date }>> {
    const roles: AiMessageRole[] = [
      AiMessageRole.USER,
      AiMessageRole.ASSISTANT,
      AiMessageRole.STAFF,
    ];
    if (opts.includeSystem) roles.push(AiMessageRole.SYSTEM);
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId, role: { in: roles } },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, createdAt: true },
    });
    const map = { USER: 'user', ASSISTANT: 'ai', STAFF: 'staff', SYSTEM: 'system' } as const;
    return rows.map((m) => ({
      role: map[m.role as 'USER' | 'ASSISTANT' | 'STAFF' | 'SYSTEM'],
      text: m.content,
      createdAt: m.createdAt,
    }));
  }

  /** История в формате LLM (для передачи модели). */
  async history(conversationId: string): Promise<LlmMessage[]> {
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      role: ROLE_TO_LLM[m.role],
      content: m.content,
      toolCalls:
        m.role === 'ASSISTANT' && m.toolCalls ? (m.toolCalls as unknown as LlmToolCall[]) : undefined,
      toolCallId: m.toolCallId ?? undefined,
      name: m.toolName ?? undefined,
    }));
  }

  addMessage(conversationId: string, input: AddMessageInput) {
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: input.role,
        content: input.content,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        toolCalls: input.toolCalls
          ? (input.toolCalls as unknown as Prisma.InputJsonValue)
          : undefined,
        tokensIn: input.tokensIn ?? 0,
        tokensOut: input.tokensOut ?? 0,
        model: input.model,
      },
    });
  }

  /** Диалоги по статусу (лента эскалаций: status = ESCALATED). */
  listByStatus(tenantId: string, status: AiConversationStatus) {
    return this.prisma.aiConversation.findMany({
      where: { tenantId, status },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        channel: true,
        guestId: true,
        operatorId: true,
        externalId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
    });
  }

  async assignOperator(id: string, operatorId: string) {
    // assignedAt фиксируем один раз — первый оператор, взявший диалог (time-to-pickup §5.7).
    await this.prisma.aiConversation.updateMany({
      where: { id, assignedAt: null },
      data: { assignedAt: new Date() },
    });
    return this.prisma.aiConversation.update({ where: { id }, data: { operatorId } });
  }

  setStatus(id: string, status: AiConversationStatus) {
    // Ставим вехи для QA-метрик (§5.7): эскалация и закрытие диалога.
    const data: Prisma.AiConversationUpdateInput = { status };
    if (status === AiConversationStatus.ESCALATED) data.escalatedAt = new Date();
    if (status === AiConversationStatus.CLOSED) data.closedAt = new Date();
    return this.prisma.aiConversation.update({ where: { id }, data });
  }

  addToolAudit(input: AddToolAuditInput) {
    return this.prisma.aiToolAudit.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        actorKind: input.actorKind,
        guestId: input.guestId,
        employeeId: input.employeeId,
        toolName: input.toolName,
        argsRedacted: input.argsRedacted
          ? (input.argsRedacted as Prisma.InputJsonValue)
          : undefined,
        allowed: input.allowed ?? true,
        isError: input.isError ?? false,
        result: input.result,
      },
    });
  }
}
