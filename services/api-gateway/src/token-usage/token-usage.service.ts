import { Injectable } from '@nestjs/common';
import { TokenUsageRepository } from '../repositories/token-usage.repository';
import { TokenUsage } from '../entities/token-usage.entity';

/**
 * TokenUsageService
 * Business logic for token usage tracking
 * Append-only ledger for AI token consumption
 * NO pricing logic - pure usage recording
 */
@Injectable()
export class TokenUsageService {
  constructor(
    private readonly tokenUsageRepository: TokenUsageRepository,
  ) {}

  /**
   * Record token usage for an AI interaction
   * Creates immutable ledger entry
   * @param data - Token usage data
   * @param data.sessionId - Session UUID (required)
   * @param data.conversationId - Conversation UUID (optional)
   * @param data.chatMessageId - Chat message UUID (optional)
   * @param data.model - AI model identifier (e.g., "claude-3.5-sonnet")
   * @param data.inputTokens - Input tokens consumed
   * @param data.outputTokens - Output tokens generated
   * @returns Created usage record with computed totalTokens
   */
  async recordTokenUsage(data: {
    sessionId: string;
    conversationId?: string | null;
    chatMessageId?: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<TokenUsage> {
    // Compute total tokens once at record time (immutable)
    const totalTokens = data.inputTokens + data.outputTokens;

    return await this.tokenUsageRepository.recordUsage({
      sessionId: data.sessionId,
      conversationId: data.conversationId ?? null,
      chatMessageId: data.chatMessageId ?? null,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens,
    });
  }

  /**
   * Get total tokens consumed by a session
   * Aggregates all usage records for billing calculations
   * @param sessionId - Session UUID
   * @returns Total token count
   */
  async getTotalTokensBySession(sessionId: string): Promise<number> {
    return await this.tokenUsageRepository.getTotalUsageBySession(sessionId);
  }

  /**
   * Get all usage records for a session
   * For detailed usage analysis and auditing
   * @param sessionId - Session UUID
   * @returns Array of usage records (newest first)
   */
  async getUsageHistoryBySession(sessionId: string): Promise<TokenUsage[]> {
    return await this.tokenUsageRepository.getUsageBySession(sessionId);
  }
}
