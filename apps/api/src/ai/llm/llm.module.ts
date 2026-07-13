import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { LlmPort } from './llm.port.js';
import { DeepSeekAdapter } from './deepseek.adapter.js';
import { MockLlmAdapter } from './mock-llm.adapter.js';

/** Реализация LlmPort выбирается по LLM_PROVIDER (mock | deepseek). */
@Global()
@Module({
  providers: [
    MockLlmAdapter,
    DeepSeekAdapter,
    {
      provide: LlmPort,
      inject: [ConfigService, MockLlmAdapter, DeepSeekAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        mock: MockLlmAdapter,
        deepseek: DeepSeekAdapter,
      ) => (config.get('LLM_PROVIDER', { infer: true }) === 'deepseek' ? deepseek : mock),
    },
  ],
  exports: [LlmPort],
})
export class LlmModule {}
