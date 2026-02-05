import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { QuotaEvaluationService } from './quota-evaluation.service';
import { InternalServiceAuthGuard } from '../guards/internal-service-auth.guard';

/**
 * InternalQuotaVisibilityController (Task 9.7A)
 * Internal-only endpoints for quota and plan visibility
 * NOT exposed to public API - requires internal service auth
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are READ-ONLY
 * - No enforcement logic
 * - No quota blocking
 * - No billing integration
 * - No mutations
 * - Internal service authentication required
 *
 * FAILURE HANDLING:
 * - Lookup failures → fallback to FREE plan
 * - Evaluation failures → status = "UNKNOWN"
 * - No 5xx errors unless auth fails
 */
@Controller('api/internal/quota-visibility')
@UseGuards(InternalServiceAuthGuard)
export class InternalQuotaVisibilityController {
  constructor(private quotaEvaluationService: QuotaEvaluationService) {}

  /**
   * Get full quota and plan details for a user
   * Task 9.7A: Read-only visibility into plan, limits, usage, and status
   *
   * Returns:
   * - userId
   * - planType (free/pro/enterprise)
   * - planLimits (maxTokens, maxCost, maxTerminations)
   * - currentMonthUsage (tokens, cost, terminations)
   * - quotaStatus (OK/WARN/EXCEEDED)
   * - period (current month start/end)
   *
   * @param userId - User UUID
   * @returns Full quota visibility details
   */
  @Get('user/:userId')
  getQuotaDetails(@Param('userId') userId: string) {
    try {
      // Get plan and limits
      const limits = this.quotaEvaluationService.getQuotaLimits(userId);

      // Get current month quota evaluation
      const evaluation =
        this.quotaEvaluationService.evaluateUserQuotaCurrentMonth(userId);

      return {
        userId: evaluation.userId,
        planType: limits.planType,
        planLimits: {
          maxTokensPerMonth: limits.maxTokensPerMonth,
          maxCostUsdPerMonth: limits.maxCostUsdPerMonth,
          maxTerminationsPerMonth: limits.maxTerminationsPerMonth,
        },
        currentMonthUsage: {
          tokens: {
            used: evaluation.tokens.used,
            limit: evaluation.tokens.limit,
            percentage: evaluation.tokens.percentage,
          },
          cost: {
            used: evaluation.cost.used,
            limit: evaluation.cost.limit,
            percentage: evaluation.cost.percentage,
          },
          terminations: {
            count: evaluation.terminations.count,
            limit: evaluation.terminations.limit,
            percentage: evaluation.terminations.percentage,
          },
        },
        quotaStatus: evaluation.status,
        period: {
          start: evaluation.period.start,
          end: evaluation.period.end,
        },
      };
    } catch (error) {
      // Fail gracefully - return UNKNOWN status
      console.error(
        `[Task 9.7A] Failed to get quota details for user ${userId}:`,
        error.message,
      );

      // Return safe fallback response
      return {
        userId,
        planType: 'free',
        planLimits: {
          maxTokensPerMonth: 100_000,
          maxCostUsdPerMonth: 5.0,
          maxTerminationsPerMonth: 20,
        },
        currentMonthUsage: {
          tokens: { used: 0, limit: 100_000, percentage: 0 },
          cost: { used: 0, limit: 5.0, percentage: 0 },
          terminations: { count: 0, limit: 20, percentage: 0 },
        },
        quotaStatus: 'UNKNOWN',
        period: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Get plan limits only for a user
   * Task 9.7A: Read-only visibility into plan and configured limits
   *
   * Returns:
   * - planType (free/pro/enterprise)
   * - limits (maxTokens, maxCost, maxTerminations)
   * - thresholds (warn, exceeded)
   *
   * @param userId - User UUID
   * @returns Plan and limit configuration
   */
  @Get('user/:userId/limits')
  getPlanLimits(@Param('userId') userId: string) {
    try {
      const limits = this.quotaEvaluationService.getQuotaLimits(userId);

      return {
        planType: limits.planType,
        limits: {
          maxTokensPerMonth: limits.maxTokensPerMonth,
          maxCostUsdPerMonth: limits.maxCostUsdPerMonth,
          maxTerminationsPerMonth: limits.maxTerminationsPerMonth,
        },
        thresholds: {
          warnThresholdPercentage: limits.warnThresholdPercentage,
          exceededThresholdPercentage: limits.exceededThresholdPercentage,
        },
      };
    } catch (error) {
      // Fail gracefully - return FREE plan limits
      console.error(
        `[Task 9.7A] Failed to get plan limits for user ${userId}:`,
        error.message,
      );

      return {
        planType: 'free',
        limits: {
          maxTokensPerMonth: 100_000,
          maxCostUsdPerMonth: 5.0,
          maxTerminationsPerMonth: 20,
        },
        thresholds: {
          warnThresholdPercentage: 80.0,
          exceededThresholdPercentage: 100.0,
        },
      };
    }
  }

  /**
   * Get quota status only for a user
   * Task 9.7A: Read-only visibility into current quota status
   *
   * Returns:
   * - planType (free/pro/enterprise)
   * - quotaStatus (OK/WARN/EXCEEDED/UNKNOWN)
   * - percentages (per category)
   *
   * @param userId - User UUID
   * @returns Quota status summary
   */
  @Get('user/:userId/status')
  getQuotaStatus(@Param('userId') userId: string) {
    try {
      const limits = this.quotaEvaluationService.getQuotaLimits(userId);
      const evaluation =
        this.quotaEvaluationService.evaluateUserQuotaCurrentMonth(userId);

      return {
        planType: limits.planType,
        quotaStatus: evaluation.status,
        percentages: {
          tokens: evaluation.tokens.percentage,
          cost: evaluation.cost.percentage,
          terminations: evaluation.terminations.percentage,
        },
      };
    } catch (error) {
      // Fail gracefully - return UNKNOWN status
      console.error(
        `[Task 9.7A] Failed to get quota status for user ${userId}:`,
        error.message,
      );

      return {
        planType: 'free',
        quotaStatus: 'UNKNOWN',
        percentages: {
          tokens: 0,
          cost: 0,
          terminations: 0,
        },
      };
    }
  }
}
