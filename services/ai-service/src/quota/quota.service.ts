import { Injectable, Logger } from '@nestjs/common';
import { ApiGatewayHttpClient } from '../clients/api-gateway-http.client';
import { QuotaExceededException } from '../errors/quota-exceeded.exception';
import {
  MAX_TOKENS_PER_SESSION,
  ESTIMATED_TOKENS_PER_REQUEST,
} from '../config/quota.config';

/**
 * QuotaService
 * Pre-flight quota enforcement for Claude API calls
 * Task 5.1B: Hard Quota Enforcement
 *
 * Design:
 * - Check current usage via HTTP before each Claude API call
 * - Throw QuotaExceededException if limit would be exceeded
 * - Fail-fast: no retries, no fallbacks
 * - Claude API must NOT be called when quota exceeded
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly apiGatewayClient: ApiGatewayHttpClient) {}

  /**
   * Check if session has quota remaining for a request
   * Throws QuotaExceededException if quota would be exceeded
   * @param sessionId - Session UUID
   * @param estimatedTokens - Estimated tokens for the request (optional, uses default)
   * @throws QuotaExceededException if quota exceeded
   */
  async checkQuota(
    sessionId: string,
    estimatedTokens: number = ESTIMATED_TOKENS_PER_REQUEST,
  ): Promise<void> {
    // Get current usage via HTTP (Task 5.1A)
    const currentUsage = await this.apiGatewayClient.getTotalTokenUsage(sessionId);

    // Calculate projected usage
    const projectedUsage = currentUsage + estimatedTokens;

    this.logger.debug(
      `Quota check: session=${sessionId}, current=${currentUsage}, estimated=${estimatedTokens}, projected=${projectedUsage}, limit=${MAX_TOKENS_PER_SESSION}`,
    );

    // Enforce hard limit
    if (projectedUsage > MAX_TOKENS_PER_SESSION) {
      this.logger.warn(
        `Quota exceeded: session=${sessionId}, current=${currentUsage}, limit=${MAX_TOKENS_PER_SESSION}`,
      );

      throw new QuotaExceededException(
        sessionId,
        currentUsage,
        MAX_TOKENS_PER_SESSION,
        estimatedTokens,
      );
    }

    this.logger.debug(`Quota check passed: session=${sessionId}`);
  }

  /**
   * Get current quota status for a session
   * Non-throwing method for UI display
   * @param sessionId - Session UUID
   * @returns Quota status
   */
  async getQuotaStatus(sessionId: string): Promise<{
    currentUsage: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  }> {
    const currentUsage = await this.apiGatewayClient.getTotalTokenUsage(sessionId);
    const remaining = Math.max(0, MAX_TOKENS_PER_SESSION - currentUsage);
    const percentUsed = (currentUsage / MAX_TOKENS_PER_SESSION) * 100;

    return {
      currentUsage,
      limit: MAX_TOKENS_PER_SESSION,
      remaining,
      percentUsed: Math.min(100, percentUsed),
    };
  }
}
