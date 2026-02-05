import { AIExecutionRequest, AIExecutionResult } from '../types';

/**
 * AIAdapter
 *
 * Stage C2-D: Adapter Interface
 *
 * Abstract interface for AI execution providers.
 * Implementations provide the actual AI execution logic.
 *
 * Design:
 * - Provider-agnostic contract
 * - No SDK dependencies at interface level
 * - Adapters implement model-specific logic
 */
export interface AIAdapter {
  /**
   * Model identifier
   * Examples: 'stub', 'claude-sonnet-4', 'gpt-4'
   */
  readonly model: string;

  /**
   * Execute AI request
   *
   * @param request - AI execution request
   * @returns AI execution result
   * @throws Error if execution fails
   */
  execute(request: AIExecutionRequest): Promise<AIExecutionResult>;
}
