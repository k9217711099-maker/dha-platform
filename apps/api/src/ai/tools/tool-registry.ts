import type { LlmToolDef } from '../llm/llm.types.js';
import type { AgentTool, ToolContext, ToolResult } from './agent-tool.js';

/**
 * Реестр инструментов агента: фильтрует по правам контекста (копилот — по правам
 * роли сотрудника; гостевые — без прав) и исполняет по имени. Гейтинг RBAC —
 * физический: недоступный инструмент не попадает ни в список для модели, ни в
 * исполнение.
 */
export class ToolRegistry {
  constructor(private readonly tools: AgentTool[]) {}

  private allowed(tool: AgentTool, ctx: ToolContext): boolean {
    return !tool.requiredPermission || (ctx.permissions ?? []).includes(tool.requiredPermission);
  }

  available(ctx: ToolContext): AgentTool[] {
    return this.tools.filter((t) => this.allowed(t, ctx));
  }

  get(name: string): AgentTool | undefined {
    return this.tools.find((t) => t.name === name);
  }

  defs(ctx: ToolContext): LlmToolDef[] {
    return this.available(ctx).map((t) => t.toDef());
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) return { content: `Инструмент «${name}» не найден.`, isError: true };
    if (!this.allowed(tool, ctx)) {
      return { content: `Недостаточно прав для «${name}».`, isError: true };
    }
    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      return { content: `Ошибка инструмента: ${(err as Error).message}`, isError: true };
    }
  }
}
