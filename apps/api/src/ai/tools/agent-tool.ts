import type { LlmToolDef } from '../llm/llm.types.js';

/** Контекст исполнения инструмента: кто вызывает и с какими правами. */
export interface ToolContext {
  actor: 'guest' | 'staff';
  conversationId: string;
  tenantId: string;
  guestId?: string;
  employeeId?: string;
  /** Права роли сотрудника (для копилота); у гостя пусто. */
  permissions?: string[];
}

export interface ToolResult {
  /** Текст-результат для модели. */
  content: string;
  /** Доп. данные для нашей логики/UI (в модель не идут). */
  data?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Базовый класс инструмента агента. Инструмент описывает себя (имя/описание/схема
 * входа — для модели) и исполняется под контекстом (RBAC — для копилота).
 */
export abstract class AgentTool {
  abstract readonly name: string;
  abstract readonly description: string;
  /** JSON-Schema входных параметров. */
  abstract readonly parameters: Record<string, unknown>;
  /** Требуемое право (копилот сотрудника). Гостевые инструменты — без права. */
  readonly requiredPermission?: string;
  /** true — инструмент меняет данные: у копилота требует подтверждения сотрудника. */
  readonly mutates: boolean = false;

  abstract execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;

  toDef(): LlmToolDef {
    return { name: this.name, description: this.description, parameters: this.parameters };
  }
}
