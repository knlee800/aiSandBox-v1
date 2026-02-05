import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIExecutionRequest, AIExecutionResult } from './types';
import { AIAdapter } from './adapters/ai-adapter.interface';
import { AI_ADAPTER } from './adapters/tokens';

/**
 * AIExecutionService
 *
 * Stage C2-B: Service skeleton established
 * Stage C2-D: Adapter interface wired, delegation pattern implemented
 *
 * Purpose:
 * This service defines the orchestration boundary for AI execution.
 * It delegates execution to an injected AIAdapter implementation.
 *
 * Design:
 * - Provider-agnostic orchestration
 * - Adapter pattern for execution delegation
 * - No direct SDK dependencies
 */
@Injectable()
export class AIExecutionService {
  private readonly logger = new Logger(AIExecutionService.name);

  constructor(
    @Inject(AI_ADAPTER) private readonly adapter: AIAdapter,
  ) {}

  /**
   * Execute AI request
   *
   * Stage C2-D: Delegates to injected adapter
   *
   * @param request - AI execution request
   * @returns AI execution result from adapter
   */
  async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
    this.logger.debug(
      `[Stage C2-D] Executing AI request via adapter (model=${this.adapter.model}, session=${request.sessionId})`,
    );

    return this.adapter.execute(request);
  }
}
