import { Injectable, Logger } from '@nestjs/common';
import { AIAdapter } from './ai-adapter.interface';
import { AIExecutionRequest, AIExecutionResult } from '../types';

/**
 * StubAIAdapter
 *
 * Stage C2-D: Stub Adapter Implementation
 *
 * Deterministic stub adapter for testing AI execution flow without real AI calls.
 *
 * Behavior:
 * - Returns fixed placeholder output
 * - No external API calls
 * - No SDK usage
 * - Zero tokens reported
 *
 * This adapter exists solely for wiring verification.
 * Real AI adapters will be introduced in later stages.
 */
@Injectable()
export class StubAIAdapter implements AIAdapter {
  private readonly logger = new Logger(StubAIAdapter.name);

  readonly model = 'stub';

  /**
   * Execute AI request (stub)
   *
   * Returns deterministic placeholder response.
   * No actual AI execution occurs.
   *
   * @param request - AI execution request
   * @returns Stub AI execution result
   */
  async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
    this.logger.debug(
      `[Stage C2-D] StubAIAdapter.execute() called for session=${request.sessionId}`,
    );

    // Stage C2-D: Deterministic stub response
    return {
      output: '[STUB] AI execution not implemented yet',
      tokensUsed: 0,
      model: this.model,
    };
  }
}
