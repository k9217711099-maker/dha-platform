import { Injectable } from '@nestjs/common';
import { AiConversationStatus } from '@prisma/client';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { ConversationService } from '../../conversations/conversation.service.js';

/**
 * Передать диалог администратору (§4.7 ТЗ). Ставит статус диалога ESCALATED —
 * далее он попадает в ленту эскалаций админки (operator inbox).
 */
@Injectable()
export class EscalateTool extends AgentTool {
  readonly name = 'escalate_to_admin';
  readonly description =
    'Передать диалог администратору: вопросы об оплате/возврате/отмене, споры, жалобы, сложные или чувствительные ситуации, а также явная просьба гостя.';
  readonly parameters = {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Краткая причина эскалации' },
      summary: { type: 'string', description: 'Краткое резюме диалога для администратора' },
    },
    required: ['reason'],
    additionalProperties: false,
  };

  constructor(private readonly conversations: ConversationService) {
    super();
  }

  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    await this.conversations.setStatus(ctx.conversationId, AiConversationStatus.ESCALATED);
    return {
      content:
        'Диалог передан администратору. Сообщи гостю тёпло, что подключаешь коллегу и он скоро ответит; конкретных сроков не обещай.',
      data: { escalated: true },
    };
  }
}
