import { ToolRegistry } from './tool-registry.js';

/**
 * Отдельный реестр инструментов копилота сотрудника (отличный от гостевого по DI-
 * токену). Инструменты гейтятся по правам роли сотрудника; действия на запись
 * требуют подтверждения (см. CopilotAgentService).
 */
export class CopilotToolRegistry extends ToolRegistry {}
