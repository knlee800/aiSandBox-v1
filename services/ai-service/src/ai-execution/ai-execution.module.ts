import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIExecutionService } from './ai-execution.service';
import { StubAIAdapter } from './adapters/stub-ai.adapter';
import { AnthropicAdapter } from './adapters/anthropic-ai.adapter';
import { OpenAIAdapter } from './adapters/openai-ai.adapter';
import { AI_ADAPTER, AI_PROVIDER_CONFIG } from './adapters/tokens';
import { AIProviderConfig } from './types';
import { AIAdapter } from './adapters/ai-adapter.interface';

/**
 * AIExecutionModule
 *
 * Stage C2-B: Service skeleton registered
 * Stage C2-D: Adapter interface + stub adapter wired
 * Stage C2-G: Configuration-driven adapter selection
 * Stage C2-H: Anthropic adapter integration
 * Stage C2-K: Provider configuration wiring
 * Stage C2-I: OpenAI adapter integration
 *
 * Providers:
 * - AIExecutionService (orchestration)
 * - StubAIAdapter (deterministic stub implementation)
 * - AnthropicAdapter (real Anthropic Claude integration)
 * - OpenAIAdapter (real OpenAI integration)
 * - AI_ADAPTER token binding (DI abstraction via factory)
 * - AI_PROVIDER_CONFIG token (optional configuration)
 *
 * This module establishes the module boundary for AI execution orchestration.
 */
@Module({
  providers: [
    AIExecutionService,
    StubAIAdapter,
    {
      provide: AI_ADAPTER,
      useFactory: (
        config?: AIProviderConfig,
        configService?: ConfigService,
      ): AIAdapter => {
        // Default to stub if no config provided
        const provider = config?.provider ?? 'stub';

        switch (provider) {
          case 'stub':
            return new StubAIAdapter();

          case 'anthropic': {
            // C2-K: Resolve API key from ConfigService
            const apiKey = configService?.get<string>('ANTHROPIC_API_KEY');

            // Validate configuration
            if (!apiKey || apiKey.trim().length === 0) {
              throw new Error(
                'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
              );
            }

            // Instantiate adapter with resolved configuration
            return new AnthropicAdapter(apiKey);
          }

          case 'openai': {
            // C2-I: Resolve API key from ConfigService
            const apiKey = configService?.get<string>('OPENAI_API_KEY');

            // Validate configuration
            if (!apiKey || apiKey.trim().length === 0) {
              throw new Error(
                'OPENAI_API_KEY environment variable is required when provider is "openai"',
              );
            }

            // Instantiate adapter with resolved configuration
            return new OpenAIAdapter(apiKey);
          }

          // Future adapters:
          // case 'groq': return new GroqAdapter(...);

          default:
            // Fail-safe: return stub for unknown providers
            return new StubAIAdapter();
        }
      },
      inject: [
        { token: AI_PROVIDER_CONFIG, optional: true },
        { token: ConfigService, optional: true },
      ],
    },
  ],
  exports: [AIExecutionService],
})
export class AIExecutionModule {}
