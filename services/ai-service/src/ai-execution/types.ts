/**
 * AI Execution Contracts
 *
 * Stage C2-A: LOCKED
 * These interfaces define the contract boundary for AI execution.
 * DO NOT modify without explicit architectural approval.
 */

/**
 * AIExecutionRequest
 * Input contract for AI execution operations
 */
export interface AIExecutionRequest {
  sessionId: string;
  conversationId: string;
  userId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

/**
 * AIExecutionResult
 * Output contract for AI execution operations
 */
export interface AIExecutionResult {
  output: string;
  tokensUsed: number;
  model: string;
}

/**
 * AIProviderConfig
 * Configuration for AI adapter selection
 *
 * Stage C2-G: Configuration-driven adapter selection (LOCKED)
 *
 * Specifies which AI provider adapter should be instantiated.
 * Provider-specific configuration (API keys, options) is NOT part of this interface.
 * That configuration is provided separately (e.g., via ConfigService in C2-K).
 */
export interface AIProviderConfig {
  /**
   * Provider to use for AI execution
   * - 'stub': Deterministic stub adapter (default)
   * - 'anthropic': Anthropic Claude adapter (C2-H)
   * - 'openai': OpenAI adapter (C2-I)
   * - 'groq': Groq adapter (C2-J)
   */
  provider: 'stub' | 'anthropic' | 'openai' | 'groq';
}
