import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { LlmPort } from './llm.port.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmModelTier,
  LlmToolCall,
} from './llm.types.js';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Адаптер DeepSeek — китайское облако, OpenAI-совместимый Chat Completions API
 * (решение 2026-07-08). Endpoint в материковом КНР: перед отправкой пользовательский
 * текст должен быть промаскирован (PiiMaskingService, §8 ТЗ) — этим занимается слой
 * агента, не адаптер.
 */
@Injectable()
export class DeepSeekAdapter extends LlmPort {
  private readonly logger = new Logger('DeepSeekLlm');

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = this.config.get('DEEPSEEK_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'DEEPSEEK_API_KEY не задан. Укажите ключ или используйте LLM_PROVIDER=mock.',
      );
    }
    const base = this.config.get('DEEPSEEK_API_BASE', { infer: true });
    const model = this.modelFor(req.tier);

    const messages: Array<Record<string, unknown>> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.arguments) },
          })),
        });
      } else if (m.role === 'tool') {
        messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const body: Record<string, unknown> = { model, messages };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = req.toolChoice ?? 'auto';
    }
    if (typeof req.temperature === 'number') body.temperature = req.temperature;
    if (typeof req.maxTokens === 'number') body.max_tokens = req.maxTokens;

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    }).catch((err: unknown) => {
      this.logger.error(`Сеть DeepSeek недоступна: ${(err as Error).message}`);
      throw new ServiceUnavailableException('LLM-провайдер недоступен (сеть).');
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`DeepSeek ${res.status}: ${detail.slice(0, 500)}`);
      throw new ServiceUnavailableException(`LLM-провайдер вернул ошибку ${res.status}.`);
    }

    const data = (await res.json()) as OpenAiResponse;
    const choice = data.choices?.[0];
    const toolCalls: LlmToolCall[] = (choice?.message?.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      arguments: safeParseArgs(c.function.arguments),
    }));

    return {
      text: choice?.message?.content ?? '',
      toolCalls,
      finishReason: choice?.finish_reason ?? 'stop',
      model: data.model ?? model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  private modelFor(tier?: LlmModelTier): string {
    switch (tier) {
      case 'fast':
        return this.config.get('DEEPSEEK_MODEL_FAST', { infer: true });
      case 'reasoner':
        return this.config.get('DEEPSEEK_MODEL_REASONER', { infer: true });
      default:
        return this.config.get('DEEPSEEK_MODEL', { infer: true });
    }
  }
}

/** Аргументы инструмента приходят строкой JSON — парсим безопасно. */
function safeParseArgs(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
