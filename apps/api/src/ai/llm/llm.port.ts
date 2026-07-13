import type { LlmCompletionRequest, LlmCompletionResult } from './llm.types.js';

/**
 * Порт LLM-провайдера для AI-агентов. Реализации: DeepSeekAdapter (китайское
 * облако, OpenAI-совместимый API — решение владельца 2026-07-08) и MockLlmAdapter
 * (разработка/тесты). Смена провайдера — через LLM_PROVIDER, без изменения логики
 * агентов. Тем же OpenAI-совместимым адаптером через смену endpoint/ключа можно
 * ходить в Qwen/GLM.
 */
export abstract class LlmPort {
  abstract complete(req: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
