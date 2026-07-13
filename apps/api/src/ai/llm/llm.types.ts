/** Типы LLM-порта (провайдер-независимые, форма близка к OpenAI/DeepSeek). */

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Вызовы инструментов (для role==='assistant'). */
  toolCalls?: LlmToolCall[];
  /** ID вызова, на который отвечает сообщение (для role==='tool'). */
  toolCallId?: string;
  /** Имя инструмента (для role==='tool'). */
  name?: string;
}

/** Определение инструмента: имя, описание и JSON-Schema входа. */
export interface LlmToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Запрошенный моделью вызов инструмента. */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Уровень модели: fast — роутинг/простые ответы, default — основная работа,
 * reasoner — сложное многошаговое рассуждение (напр. DeepSeek R1).
 */
export type LlmModelTier = 'fast' | 'default' | 'reasoner';

export type LlmToolChoice = 'auto' | 'none' | 'required';

export interface LlmCompletionRequest {
  /** Системный промпт (роль/тон/правила). */
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  toolChoice?: LlmToolChoice;
  tier?: LlmModelTier;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletionResult {
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: string;
  model: string;
  usage: LlmUsage;
}
