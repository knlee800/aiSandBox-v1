import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { QuotaEvaluationService } from './quota-evaluation.service';
import { InternalServiceAuthGuard } from '../guards/internal-service-auth.guard';

/**
 * InternalQuotaEvaluationController (Task 9.4A)
 * Internal-only endpoints for quota evaluation and status checks
 * NOT exposed to public API - requires internal service auth
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are READ-ONLY
 * - No request blocking
 * - No enforcement logic
 * - Calculation and exposure only
 * - Internal service authentication required
 */
@Controller('api/internal/quota-evaluations')
@UseGuards(InternalServiceAuthGuard)
export class InternalQuotaEvaluationController {
  constructor(private quotaEvaluationService: QuotaEvaluationService) {}

  /**
   * Evaluate quota status for a user over a custom period
   * Task 9.4A: Read-only quota evaluation
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Quota evaluation result
   */
  @Get('user/:userId')
  evaluateUserQuota(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    // Validate required date parameters
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Both startDate and endDate query parameters are required',
      );
    }

    // Validate date formats
    if (!this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (!this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.quotaEvaluationService.evaluateUserQuota(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Evaluate quota status for current month (convenience endpoint)
   * Task 9.4A: Read-only quota evaluation
   *
   * @param userId - User UUID
   * @returns Quota evaluation result for current month
   */
  @Get('user/:userId/current-month')
  evaluateUserQuotaCurrentMonth(@Param('userId') userId: string) {
    return this.quotaEvaluationService.evaluateUserQuotaCurrentMonth(userId);
  }

  /**
   * Get detailed quota breakdown with per-category status
   * Task 9.4A: Read-only quota evaluation with granular status
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Detailed quota evaluation
   */
  @Get('user/:userId/detailed')
  evaluateUserQuotaDetailed(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Both startDate and endDate query parameters are required',
      );
    }

    if (!this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (!this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    return this.quotaEvaluationService.evaluateUserQuotaDetailed(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Check if user has exceeded any quota (boolean endpoint)
   * Task 9.4A: Read-only quota check
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Boolean result
   */
  @Get('user/:userId/exceeded')
  hasUserExceededQuota(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Both startDate and endDate query parameters are required',
      );
    }

    if (!this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (!this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    const exceeded = this.quotaEvaluationService.hasUserExceededQuota(
      userId,
      startDate,
      endDate,
    );

    return {
      userId,
      period: { start: startDate, end: endDate },
      exceeded,
    };
  }

  /**
   * Check if user is approaching quota limits (boolean endpoint)
   * Task 9.4A: Read-only quota check
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Boolean result
   */
  @Get('user/:userId/approaching-limit')
  isUserApproachingQuotaLimit(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Both startDate and endDate query parameters are required',
      );
    }

    if (!this.isValidISODate(startDate)) {
      throw new BadRequestException('startDate must be a valid ISO 8601 date');
    }
    if (!this.isValidISODate(endDate)) {
      throw new BadRequestException('endDate must be a valid ISO 8601 date');
    }

    const approaching =
      this.quotaEvaluationService.isUserApproachingQuotaLimit(
        userId,
        startDate,
        endDate,
      );

    return {
      userId,
      period: { start: startDate, end: endDate },
      approachingLimit: approaching,
    };
  }

  /**
   * Get configured quota limits (for transparency/debugging)
   * Task 9.4A: Expose current quota configuration
   *
   * @returns Current quota limits
   */
  @Get('limits')
  getQuotaLimits() {
    return this.quotaEvaluationService.getQuotaLimits();
  }

  /**
   * Helper to validate ISO 8601 date format
   */
  private isValidISODate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === date.toISOString();
  }
}
