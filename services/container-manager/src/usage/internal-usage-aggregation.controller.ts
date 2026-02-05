import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { UsageAggregationService } from './usage-aggregation.service';
import { InternalServiceAuthGuard } from '../guards/internal-service-auth.guard';

/**
 * InternalUsageAggregationController (Task 9.3B)
 * Internal-only endpoints for usage and governance event aggregation
 * NOT exposed to public API - requires internal service auth
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are READ-ONLY
 * - No enforcement logic
 * - No quota blocking
 * - No billing integration
 * - Internal service authentication required
 */
@Controller('api/internal/usage-aggregations')
@UseGuards(InternalServiceAuthGuard)
export class InternalUsageAggregationController {
  constructor(private usageAggregationService: UsageAggregationService) {}

  /**
   * Get token usage aggregation by session
   * Task 9.3B: Read-only aggregation for billing/quota
   *
   * @param sessionId - Session UUID
   * @returns Token usage summary
   */
  @Get('tokens/session/:sessionId')
  getTokenUsageBySession(@Param('sessionId') sessionId: string) {
    return this.usageAggregationService.aggregateTokenUsageBySession(sessionId);
  }

  /**
   * Get token usage aggregation by user
   * Task 9.3B: Read-only aggregation for billing/quota
   *
   * @param userId - User UUID
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Token usage summary
   */
  @Get('tokens/user/:userId')
  getTokenUsageByUser(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Validate date formats if provided
    if (startDate && !this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (endDate && !this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.usageAggregationService.aggregateTokenUsageByUser(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Get token usage breakdown by AI provider for a user
   * Task 9.3B: Read-only aggregation for billing/quota
   *
   * @param userId - User UUID
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Provider-level token usage breakdown
   */
  @Get('tokens/user/:userId/by-provider')
  getTokenUsageByProvider(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && !this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (endDate && !this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.usageAggregationService.aggregateTokenUsageByProvider(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Get governance events aggregated by termination reason
   * Task 9.3B: Read-only aggregation for observability
   *
   * @param userId - Optional user UUID filter
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Governance events breakdown by reason
   */
  @Get('governance-events/by-reason')
  getGovernanceEventsByReason(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && !this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (endDate && !this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.usageAggregationService.aggregateGovernanceEventsByReason(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Get governance events aggregated by user
   * Task 9.3B: Read-only aggregation for observability
   *
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Governance events breakdown by user
   */
  @Get('governance-events/by-user')
  getGovernanceEventsByUser(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && !this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (endDate && !this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.usageAggregationService.aggregateGovernanceEventsByUser(
      startDate,
      endDate,
    );
  }

  /**
   * Get session termination summary
   * Task 9.3B: Read-only aggregation for session lifecycle observability
   *
   * @param userId - Optional user UUID filter
   * @returns Summary of active vs terminated sessions
   */
  @Get('sessions/terminations')
  getSessionTerminations(@Query('userId') userId?: string) {
    return this.usageAggregationService.aggregateSessionTerminations(userId);
  }

  /**
   * Get comprehensive usage summary for a user
   * Task 9.3B: Combined read-only aggregation for billing/quota dashboard
   *
   * @param userId - User UUID
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Comprehensive usage summary
   */
  @Get('user/:userId/summary')
  getUserUsageSummary(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && !this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (endDate && !this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.usageAggregationService.getUserUsageSummary(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Helper to validate ISO 8601 date format
   */
  private isValidISODate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === date.toISOString();
  }
}
