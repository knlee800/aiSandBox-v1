import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { UsageAggregationService } from '../usage/usage-aggregation.service';
import { QuotaEvaluationService } from '../usage/quota-evaluation.service';
import { PlanQuotaConfig } from '../config/plan-quota.config';
import { InternalServiceAuthGuard } from '../guards/internal-service-auth.guard';

/**
 * BillingExportController (Task 10A)
 * Internal-only endpoints for billing data export
 * NOT exposed to public API - requires internal service auth
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are READ-ONLY
 * - No billing actions (no charging, no invoicing)
 * - No enforcement logic
 * - No quota blocking
 * - No mutations
 * - Internal service authentication required
 *
 * FAILURE HANDLING:
 * - Aggregation failures → return empty usage + status: "INCOMPLETE"
 * - No 5xx errors unless auth fails
 * - Do NOT block billing export
 */
@Controller('api/internal/billing-export')
@UseGuards(InternalServiceAuthGuard)
export class BillingExportController {
  constructor(
    private usageAggregationService: UsageAggregationService,
    private quotaEvaluationService: QuotaEvaluationService,
    private planQuotaConfig: PlanQuotaConfig,
  ) {}

  /**
   * Get billing-ready usage summary for a user over a date range
   * Task 10A: Read-only billing data export
   *
   * Returns:
   * - userId
   * - planType
   * - period (start, end)
   * - tokenUsage (input, output, total)
   * - costUsd
   * - providerBreakdown
   * - governanceEvents (counts by reason)
   * - sessionCounts (total / terminated)
   * - status (COMPLETE / INCOMPLETE)
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601) - required
   * @param endDate - Period end (ISO 8601) - required
   * @returns Billing-ready usage summary
   */
  @Get('user/:userId/usage')
  getUserUsage(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Validate required query params
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Both startDate and endDate query parameters are required (ISO 8601 format)',
      );
    }

    try {
      // Get user's plan type
      const limits = this.quotaEvaluationService.getQuotaLimits(userId);

      // Get comprehensive usage summary
      const usage = this.usageAggregationService.getUserUsageSummary(
        userId,
        startDate,
        endDate,
      );

      return {
        userId: usage.userId,
        planType: limits.planType,
        period: {
          start: startDate,
          end: endDate,
        },
        tokenUsage: {
          inputTokens: usage.tokenUsage.totalInputTokens,
          outputTokens: usage.tokenUsage.totalOutputTokens,
          totalTokens:
            usage.tokenUsage.totalInputTokens +
            usage.tokenUsage.totalOutputTokens,
        },
        costUsd: usage.tokenUsage.totalCostUsd,
        providerBreakdown: usage.providerBreakdown.map((p) => ({
          provider: p.provider,
          inputTokens: p.totalInputTokens,
          outputTokens: p.totalOutputTokens,
          totalTokens: p.totalInputTokens + p.totalOutputTokens,
          costUsd: p.totalCostUsd,
        })),
        governanceEvents: {
          total: usage.governanceEvents.totalEvents,
          byReason: usage.governanceEvents.byReason.map((e) => ({
            reason: e.terminationReason,
            count: e.count,
          })),
        },
        sessionCounts: {
          total: usage.sessions.totalSessions,
          active: usage.sessions.activeSessions,
          terminated: usage.sessions.terminatedSessions,
          terminationBreakdown: usage.sessions.terminationBreakdown.map(
            (t) => ({
              reason: t.reason,
              count: t.count,
            }),
          ),
        },
        status: 'COMPLETE',
      };
    } catch (error) {
      // Fail gracefully - return empty usage with INCOMPLETE status
      console.error(
        `[Task 10A] Failed to get billing usage for user ${userId}:`,
        error.message,
      );

      return {
        userId,
        planType: 'free',
        period: {
          start: startDate,
          end: endDate,
        },
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        costUsd: 0,
        providerBreakdown: [],
        governanceEvents: {
          total: 0,
          byReason: [],
        },
        sessionCounts: {
          total: 0,
          active: 0,
          terminated: 0,
          terminationBreakdown: [],
        },
        status: 'INCOMPLETE',
      };
    }
  }

  /**
   * Get billing-ready usage summary for current month
   * Task 10A: Read-only billing data export (convenience method)
   *
   * Same fields as getUserUsage, but period is auto-calculated for current month.
   *
   * @param userId - User UUID
   * @returns Current month billing-ready usage summary
   */
  @Get('user/:userId/monthly')
  getUserMonthlyUsage(@Param('userId') userId: string) {
    try {
      // Calculate current month date range
      const { startDate, endDate } = this.getCurrentMonthDateRange();

      // Get user's plan type
      const limits = this.quotaEvaluationService.getQuotaLimits(userId);

      // Get comprehensive usage summary
      const usage = this.usageAggregationService.getUserUsageSummary(
        userId,
        startDate,
        endDate,
      );

      return {
        userId: usage.userId,
        planType: limits.planType,
        period: {
          start: startDate,
          end: endDate,
        },
        tokenUsage: {
          inputTokens: usage.tokenUsage.totalInputTokens,
          outputTokens: usage.tokenUsage.totalOutputTokens,
          totalTokens:
            usage.tokenUsage.totalInputTokens +
            usage.tokenUsage.totalOutputTokens,
        },
        costUsd: usage.tokenUsage.totalCostUsd,
        providerBreakdown: usage.providerBreakdown.map((p) => ({
          provider: p.provider,
          inputTokens: p.totalInputTokens,
          outputTokens: p.totalOutputTokens,
          totalTokens: p.totalInputTokens + p.totalOutputTokens,
          costUsd: p.totalCostUsd,
        })),
        governanceEvents: {
          total: usage.governanceEvents.totalEvents,
          byReason: usage.governanceEvents.byReason.map((e) => ({
            reason: e.terminationReason,
            count: e.count,
          })),
        },
        sessionCounts: {
          total: usage.sessions.totalSessions,
          active: usage.sessions.activeSessions,
          terminated: usage.sessions.terminatedSessions,
          terminationBreakdown: usage.sessions.terminationBreakdown.map(
            (t) => ({
              reason: t.reason,
              count: t.count,
            }),
          ),
        },
        status: 'COMPLETE',
      };
    } catch (error) {
      // Fail gracefully - return empty usage with INCOMPLETE status
      console.error(
        `[Task 10A] Failed to get monthly billing usage for user ${userId}:`,
        error.message,
      );

      const { startDate, endDate } = this.getCurrentMonthDateRange();

      return {
        userId,
        planType: 'free',
        period: {
          start: startDate,
          end: endDate,
        },
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        costUsd: 0,
        providerBreakdown: [],
        governanceEvents: {
          total: 0,
          byReason: [],
        },
        sessionCounts: {
          total: 0,
          active: 0,
          terminated: 0,
          terminationBreakdown: [],
        },
        status: 'INCOMPLETE',
      };
    }
  }

  /**
   * Get plan limits for all tiers
   * Task 10A: Read-only billing configuration export
   *
   * Returns:
   * - Plan limits for FREE / PRO / ENTERPRISE
   * - Quota thresholds (WARN / EXCEEDED)
   *
   * @returns Plan limits and thresholds
   */
  @Get('limits')
  getPlanLimits() {
    try {
      const allPlans = this.planQuotaConfig.getAllPlans();
      const thresholds = this.planQuotaConfig.getThresholds();

      return {
        plans: {
          free: {
            maxTokensPerMonth: allPlans.free.maxTokensPerMonth,
            maxCostUsdPerMonth: allPlans.free.maxCostUsdPerMonth,
            maxTerminationsPerMonth: allPlans.free.maxTerminationsPerMonth,
          },
          pro: {
            maxTokensPerMonth: allPlans.pro.maxTokensPerMonth,
            maxCostUsdPerMonth: allPlans.pro.maxCostUsdPerMonth,
            maxTerminationsPerMonth: allPlans.pro.maxTerminationsPerMonth,
          },
          enterprise: {
            maxTokensPerMonth: allPlans.enterprise.maxTokensPerMonth,
            maxCostUsdPerMonth: allPlans.enterprise.maxCostUsdPerMonth,
            maxTerminationsPerMonth: allPlans.enterprise.maxTerminationsPerMonth,
          },
        },
        thresholds: {
          warnThresholdPercentage: thresholds.warnThresholdPercentage,
          exceededThresholdPercentage: thresholds.exceededThresholdPercentage,
        },
      };
    } catch (error) {
      // Fail gracefully - return static defaults
      console.error(
        '[Task 10A] Failed to get plan limits:',
        error.message,
      );

      return {
        plans: {
          free: {
            maxTokensPerMonth: 100_000,
            maxCostUsdPerMonth: 5.0,
            maxTerminationsPerMonth: 20,
          },
          pro: {
            maxTokensPerMonth: 2_000_000,
            maxCostUsdPerMonth: 100.0,
            maxTerminationsPerMonth: 200,
          },
          enterprise: {
            maxTokensPerMonth: 10_000_000,
            maxCostUsdPerMonth: 500.0,
            maxTerminationsPerMonth: 1000,
          },
        },
        thresholds: {
          warnThresholdPercentage: 80.0,
          exceededThresholdPercentage: 100.0,
        },
      };
    }
  }

  /**
   * Get current month date range (ISO 8601 format)
   * Private helper method
   *
   * @returns Start and end dates for current month
   */
  private getCurrentMonthDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // First day of current month (00:00:00 UTC)
    const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    // Last day of current month (23:59:59.999 UTC)
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }
}
