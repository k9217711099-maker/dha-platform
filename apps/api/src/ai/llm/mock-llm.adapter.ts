import { Injectable, Logger } from '@nestjs/common';
import { LlmPort } from './llm.port.js';
import type { LlmCompletionRequest, LlmCompletionResult } from './llm.types.js';

/**
 * Заглушка LLM для разработки и тестов без сети. Детерминирована: не вызывает
 * инструменты, возвращает предсказуемый текст. Реальные ответы — LLM_PROVIDER=deepseek.
 */
@Injectable()
export class MockLlmAdapter extends LlmPort {
  private readonly logger = new Logger('MockLlm');

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const text = `[mock-llm] Принял: "${(lastUser?.content ?? '').slice(0, 120)}". Реальные ответы — при LLM_PROVIDER=deepseek.`;
    this.logger.debug(text);
    return {
      text,
      toolCalls: [],
      finishReason: 'stop',
      model: 'mock',
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
