import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenUsage } from '../entities/token-usage.entity';

/**
 * TokenUsageRepository
 * Data access layer for TokenUsage entity
 * Append-only ledger for token consumption tracking
 */
@Injectable()
export class TokenUsageRepository {
  constructor(
    @InjectRepository(TokenUsage)
    private readonly repository: Repository<TokenUsage>,
  ) {}

  /**
   * Record token usage for an AI interaction
   * Append-only operation - creates immutable usage record
   * @param data - Token usage data
   * @returns Created usage record
   */
  async recordUsage(data: {
    sessionId: string;
    conversationId?: string | null;
    chatMessageId?: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }): Promise<TokenUsage> {
    const usage = this.repository.create({
      sessionId: data.sessionId,
      conversationId: data.conversationId ?? null,
      chatMessageId: data.chatMessageId ?? null,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
    });

    return await this.repository.save(usage);
  }

  /**
   * Get total token usage for a session
   * @param sessionId - Session UUID
   * @returns Total tokens consumed
   */
  async getTotalUsageBySession(sessionId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('token_usage')
      .select('SUM(token_usage.total_tokens)', 'total')
      .where('token_usage.session_id = :sessionId', { sessionId })
      .getRawOne();

    return parseInt(result?.total || '0', 10);
  }

  /**
   * Get token usage records for a session
   * @param sessionId - Session UUID
   * @returns Array of usage records
   */
  async getUsageBySession(sessionId: string): Promise<TokenUsage[]> {
    return await this.repository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }
}
