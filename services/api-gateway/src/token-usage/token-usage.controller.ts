import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { TokenUsageService } from './token-usage.service';
import { RecordTokenUsageDto } from './dto/record-token-usage.dto';

/**
 * TokenUsageController
 * HTTP endpoints for token usage tracking
 * Primary consumer: ai-service
 * Routes: /api/token-usage/* (global prefix 'api' applied in main.ts)
 */
@Controller('token-usage')
export class TokenUsageController {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  /**
   * Record token usage for an AI interaction
   * POST /api/token-usage/record
   * Used by ai-service to persist token consumption data
   * @param dto - Token usage data
   * @returns void (201 Created)
   */
  @Post('record')
  @HttpCode(HttpStatus.CREATED)
  async recordTokenUsage(@Body() dto: RecordTokenUsageDto): Promise<void> {
    await this.tokenUsageService.recordTokenUsage({
      sessionId: dto.sessionId,
      chatMessageId: dto.chatMessageId,
      model: dto.model,
      inputTokens: dto.inputTokens,
      outputTokens: dto.outputTokens,
    });
  }
}
