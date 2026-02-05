import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { TokenUsageService } from './token-usage.service';

/**
 * Internal Token Usage Controller
 * HTTP endpoints for ai-service → api-gateway communication
 * READ-ONLY endpoints for quota enforcement (Task 5.1A)
 * NOT exposed to public API (use /api/internal/* routes)
 */
@Controller('api/internal/token-usage')
export class InternalTokenUsageController {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  /**
   * Get total token usage for a session
   * Called by ai-service to check current usage before API calls
   * GET /api/internal/token-usage/sessions/:sessionId/total
   * @param sessionId - Session UUID
   * @returns Total token count
   */
  @Get('sessions/:sessionId/total')
  @HttpCode(HttpStatus.OK)
  async getTotalTokensBySession(
    @Param('sessionId') sessionId: string,
  ): Promise<{ sessionId: string; totalTokens: number }> {
    const totalTokens = await this.tokenUsageService.getTotalTokensBySession(sessionId);

    return {
      sessionId,
      totalTokens,
    };
  }
}
