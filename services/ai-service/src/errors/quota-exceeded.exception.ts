import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * QuotaExceededException
 * Thrown when a session exceeds its token quota
 * Task 5.1B: Hard Quota Enforcement
 *
 * HTTP 429 Too Many Requests (rate limiting / quota)
 */
export class QuotaExceededException extends HttpException {
  constructor(
    public readonly sessionId: string,
    public readonly currentUsage: number,
    public readonly limit: number,
    public readonly estimatedRequest: number,
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Quota Exceeded',
        message: `Session ${sessionId} has exceeded its token quota. Current: ${currentUsage}, Limit: ${limit}, Estimated request: ${estimatedRequest}`,
        details: {
          sessionId,
          currentUsage,
          limit,
          estimatedRequest,
          projectedTotal: currentUsage + estimatedRequest,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
