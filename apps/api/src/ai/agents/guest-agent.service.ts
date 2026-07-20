import { Injectable, Logger } from '@nestjs/common';
import { AiActorKind, AiChannel, AiConversationStatus, AiMessageRole } from '@prisma/client';
import { LlmPort } from '../llm/llm.port.js';
import type { LlmMessage } from '../llm/llm.types.js';
import { PiiMaskingService } from '../pii/pii-masking.service.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolContext } from '../tools/agent-tool.js';
import { GUEST_AGENT_SYSTEM_PROMPT } from './prompts.js';

/** AiChannel → id канала в тумблерах (ai.channel.<id>.ai_enabled). Локально, чтобы не
 *  тянуть ChannelToggleService (циклическая зависимость модулей). */
const CHANNEL_ID: Partial<Record<AiChannel, string>> = {
  [AiChannel.WEB]: 'web',
  [AiChannel.APP]: 'app',
  [AiChannel.TELEGRAM]: 'telegram',
  [AiChannel.TELEGRAM_DIRECT]: 'tg_direct',
  [AiChannel.MAX]: 'max',
  [AiChannel.WHATSAPP]: 'whatsapp',
  [AiChannel.UMNICO]: 'umnico',
};

export interface GuestMessageInput {
  /** Существующий диалог; если не задан — создаётся новый. */
  conversationId?: string;
  tenantId: string;
  guestId?: string;
  channel: AiChannel;
  text: string;
}

export interface GuestMessageResult {
  conversationId: string;
  reply: string;
  escalated: boolean;
}

/**
 * Гостевой AI-агент: агентный цикл на LlmPort. Маскирует ПДн гостя перед отправкой
 * в модель (§8), исполняет инструменты (с аудитом), сохраняет историю, эскалирует.
 */
@Injectable()
export class GuestAgentService {
  private readonly logger = new Logger('GuestAgent');
  private readonly maxIterations = 5;

  constructor(
    private readonly llm: LlmPort,
    private readonly pii: PiiMaskingService,
    private readonly conversations: ConversationService,
    private readonly tools: ToolRegistry,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Разрешён ли автоответ бота на этом канале: глобальный тумблер AI И тумблер AI по
   * каналу (оба по умолчанию включены — выключает только явное 'false'). Настраивается
   * в админке → «AI и коммуникации» (глобально и по каждому каналу).
   */
  private async aiEnabledFor(channel: AiChannel): Promise<boolean> {
    if ((await this.settings.get('ai.agent.enabled')) === 'false') return false;
    const id = CHANNEL_ID[channel];
    if (!id) return true;
    return (await this.settings.get(`ai.channel.${id}.ai_enabled`)) !== 'false';
  }

  async handle(input: GuestMessageInput): Promise<GuestMessageResult> {
    const convo =
      (input.conversationId ? await this.conversations.get(input.conversationId) : null) ??
      (await this.conversations.create({
        tenantId: input.tenantId,
        channel: input.channel,
        actorKind: AiActorKind.GUEST,
        guestId: input.guestId,
      }));

    const ctx: ToolContext = {
      actor: 'guest',
      conversationId: convo.id,
      tenantId: convo.tenantId,
      guestId: convo.guestId ?? undefined,
    };

    // Оригинал храним в нашей БД (РФ — локализация ок); маскируем только на границе с моделью.
    await this.conversations.addMessage(convo.id, {
      role: AiMessageRole.USER,
      content: input.text,
    });

    // AI выключен (глобально или для этого канала) — модель не вызываем, диалог к оператору.
    if (!(await this.aiEnabledFor(input.channel))) {
      if (convo.status !== AiConversationStatus.ESCALATED) {
        await this.conversations.setStatus(convo.id, AiConversationStatus.ESCALATED);
      }
      return {
        conversationId: convo.id,
        reply: 'Ваше сообщение получено — администратор скоро ответит.',
        escalated: true,
      };
    }

    // Диалог передан человеку — модель молчит, сообщения копятся для оператора (лента эскалаций §4.7).
    if (convo.status === AiConversationStatus.ESCALATED) {
      return {
        conversationId: convo.id,
        reply: 'Ваше сообщение передано администратору — он скоро ответит.',
        escalated: true,
      };
    }

    const toolDefs = this.tools.defs(ctx);
    let escalated = false; // при ESCALATED мы бы уже вышли выше

    for (let i = 0; i < this.maxIterations; i++) {
      const history = await this.conversations.history(convo.id);
      const result = await this.llm.complete({
        system: GUEST_AGENT_SYSTEM_PROMPT,
        messages: this.maskForLlm(history),
        tools: toolDefs,
        toolChoice: 'auto',
      });

      await this.conversations.addMessage(convo.id, {
        role: AiMessageRole.ASSISTANT,
        content: result.text,
        toolCalls: result.toolCalls.length ? result.toolCalls : undefined,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        model: result.model,
      });

      if (result.toolCalls.length === 0) {
        return { conversationId: convo.id, reply: result.text, escalated };
      }

      for (const call of result.toolCalls) {
        const res = await this.tools.execute(call.name, call.arguments, ctx);
        await this.conversations.addToolAudit({
          tenantId: convo.tenantId,
          conversationId: convo.id,
          actorKind: AiActorKind.GUEST,
          guestId: ctx.guestId,
          toolName: call.name,
          argsRedacted: call.arguments,
          isError: res.isError ?? false,
          result: res.content.slice(0, 2000),
        });
        await this.conversations.addMessage(convo.id, {
          role: AiMessageRole.TOOL,
          content: res.content,
          toolName: call.name,
          toolCallId: call.id,
        });
        if (res.data?.escalated === true) escalated = true;
      }
    }

    this.logger.warn(`Диалог ${convo.id}: достигнут предел итераций — эскалация.`);
    await this.conversations.setStatus(convo.id, AiConversationStatus.ESCALATED);
    return {
      conversationId: convo.id,
      reply: 'Уточню детали у коллеги и вернусь с ответом — подключаю администратора.',
      escalated: true,
    };
  }

  /** Маскирует ПДн только в сообщениях гостя (role==='user') перед отправкой в модель. */
  private maskForLlm(messages: LlmMessage[]): LlmMessage[] {
    return messages.map((m) =>
      m.role === 'user' ? { ...m, content: this.pii.mask(m.content).masked } : m,
    );
  }
}
