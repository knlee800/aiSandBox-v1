import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import { UsageAggregationService } from './usage-aggregation.service';
import { PlanQuotaConfig } from '../config/plan-quota.config';

/**
 * QuotaEvaluationService (Task 9.4A + Task 9.6A)
 * Read-only computation of quota status from aggregated usage data
 *
 * CRITICAL CONSTRAINTS:
 * - All logic is READ-ONLY (no writes, no enforcement)
 * - Does NOT block any requests
 * - Does NOT reject any operations
 * - Calculation only (no behavior changes)
 * - Uses UsageAggregationService for data input
 *
 * Task 9.6A: Plan-based quota limits (replaces hard-coded constants)
 * - FREE: 100k tokens, $5, 20 terminations
 * - PRO: 2M tokens, $100, 200 terminations
 * - ENTERPRISE: 10M tokens, $500, 1000 terminations
 */
@Injectable()
export class QuotaEvaluationService {
  private db: Database.Database;

  constructor(
    private usageAggregationService: UsageAggregationService,
    private planQuotaConfig: PlanQuotaConfig,
  ) {
    // Connect to database for plan lookups
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  /**
   * Get user's plan type from database
   * Task 9.6A: User → Plan mapping
   *
   * @param userId - User UUID
   * @returns Plan type (free/pro/enterprise) or null if not found
   */
  private getUserPlan(userId: string): string | null {
    try {
      const user = this.db
        .prepare('SELECT plan_type FROM users WHERE id = ?')
        .get(userId) as { plan_type: string } | undefined;

      return user?.plan_type ?? null;
    } catch (error) {
      // Fallback on database error
      console.error(
        `[QuotaEvaluationService] Failed to get plan for user ${userId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Evaluate quota status for a user over a time period
   * Task 9.4A: Read-only quota evaluation
   * Task 9.6A: Use plan-based limits instead of hard-coded
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Quota evaluation result
   */
  evaluateUserQuota(
    userId: string,
    startDate: string,
    endDate: string,
  ): {
    userId: string;
    period: { start: string; end: string };
    tokens: {
      used: number;
      limit: number;
      percentage: number;
    };
    cost: {
      used: number;
      limit: number;
      percentage: number;
    };
    terminations: {
      count: number;
      limit: number;
      percentage: number;
    };
    status: 'OK' | 'WARN' | 'EXCEEDED';
  } {
    // Task 9.6A: Get user's plan and corresponding limits
    const userPlan = this.getUserPlan(userId);
    const planLimits = this.planQuotaConfig.getLimitsForPlan(userPlan);

    // Read aggregated usage data from Task 9.3B service
    const tokenUsage = this.usageAggregationService.aggregateTokenUsageByUser(
      userId,
      startDate,
      endDate,
    );

    const governanceEvents =
      this.usageAggregationService.aggregateGovernanceEventsByReason(
        userId,
        startDate,
        endDate,
      );

    // Calculate total terminations (sum across all reasons)
    const totalTerminations = governanceEvents.reduce(
      (sum, event) => sum + event.count,
      0,
    );

    // Calculate total tokens (input + output)
    const totalTokens = tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens;

    // Calculate percentages using plan-specific limits
    const tokenPercentage = this.calculatePercentage(
      totalTokens,
      planLimits.maxTokensPerMonth,
    );

    const costPercentage = this.calculatePercentage(
      tokenUsage.totalCostUsd,
      planLimits.maxCostUsdPerMonth,
    );

    const terminationPercentage = this.calculatePercentage(
      totalTerminations,
      planLimits.maxTerminationsPerMonth,
    );

    // Determine overall status
    const status = this.determineQuotaStatus([
      tokenPercentage,
      costPercentage,
      terminationPercentage,
    ]);

    return {
      userId,
      period: { start: startDate, end: endDate },
      tokens: {
        used: totalTokens,
        limit: planLimits.maxTokensPerMonth,
        percentage: tokenPercentage,
      },
      cost: {
        used: tokenUsage.totalCostUsd,
        limit: planLimits.maxCostUsdPerMonth,
        percentage: costPercentage,
      },
      terminations: {
        count: totalTerminations,
        limit: planLimits.maxTerminationsPerMonth,
        percentage: terminationPercentage,
      },
      status,
    };
  }

  /**
   * Evaluate quota status for current month (convenience method)
   * Task 9.4A: Read-only quota evaluation
   *
   * @param userId - User UUID
   * @returns Quota evaluation result for current month
   */
  evaluateUserQuotaCurrentMonth(userId: string): {
    userId: string;
    period: { start: string; end: string };
    tokens: {
      used: number;
      limit: number;
      percentage: number;
    };
    cost: {
      used: number;
      limit: number;
      percentage: number;
    };
    terminations: {
      count: number;
      limit: number;
      percentage: number;
    };
    status: 'OK' | 'WARN' | 'EXCEEDED';
  } {
    const { startDate, endDate } = this.getCurrentMonthDateRange();
    return this.evaluateUserQuota(userId, startDate, endDate);
  }

  /**
   * Get detailed quota breakdown with per-category status
   * Task 9.4A: Read-only quota evaluation with granular status
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Detailed quota evaluation with per-category status
   */
  evaluateUserQuotaDetailed(
    userId: string,
    startDate: string,
    endDate: string,
  ): {
    userId: string;
    period: { start: string; end: string };
    tokens: {
      used: number;
      limit: number;
      percentage: number;
      status: 'OK' | 'WARN' | 'EXCEEDED';
    };
    cost: {
      used: number;
      limit: number;
      percentage: number;
      status: 'OK' | 'WARN' | 'EXCEEDED';
    };
    terminations: {
      count: number;
      limit: number;
      percentage: number;
      status: 'OK' | 'WARN' | 'EXCEEDED';
    };
    overallStatus: 'OK' | 'WARN' | 'EXCEEDED';
  } {
    const basicEval = this.evaluateUserQuota(userId, startDate, endDate);

    return {
      userId: basicEval.userId,
      period: basicEval.period,
      tokens: {
        ...basicEval.tokens,
        status: this.determineQuotaStatus([basicEval.tokens.percentage]),
      },
      cost: {
        ...basicEval.cost,
        status: this.determineQuotaStatus([basicEval.cost.percentage]),
      },
      terminations: {
        ...basicEval.terminations,
        status: this.determineQuotaStatus([basicEval.terminations.percentage]),
      },
      overallStatus: basicEval.status,
    };
  }

  /**
   * Check if user has exceeded any quota (boolean helper)
   * Task 9.4A: Read-only quota check
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns True if any quota is exceeded (≥100%), false otherwise
   */
  hasUserExceededQuota(
    userId: string,
    startDate: string,
    endDate: string,
  ): boolean {
    const evaluation = this.evaluateUserQuota(userId, startDate, endDate);
    return evaluation.status === 'EXCEEDED';
  }

  /**
   * Check if user is approaching quota limits (boolean helper)
   * Task 9.4A: Read-only quota check
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns True if any quota is in WARN or EXCEEDED state
   */
  isUserApproachingQuotaLimit(
    userId: string,
    startDate: string,
    endDate: string,
  ): boolean {
    const evaluation = this.evaluateUserQuota(userId, startDate, endDate);
    return evaluation.status === 'WARN' || evaluation.status === 'EXCEEDED';
  }

  /**
   * Calculate percentage with safe division
   * @param used - Used amount
   * @param limit - Limit amount
   * @returns Percentage (0-100+), rounded to 2 decimals
   */
  private calculatePercentage(used: number, limit: number): number {
    if (limit === 0) {
      return used > 0 ? 100.0 : 0.0;
    }
    const percentage = (used / limit) * 100;
    return Math.round(percentage * 100) / 100; // Round to 2 decimals
  }

  /**
   * Determine quota status from percentages
   * Task 9.4A: Status calculation rules
   *
   * Status Rules:
   * - OK: all percentages < 80%
   * - WARN: any percentage ≥ 80% and < 100%
   * - EXCEEDED: any percentage ≥ 100%
   *
   * @param percentages - Array of percentage values
   * @returns Status (OK, WARN, or EXCEEDED)
   */
  private determineQuotaStatus(
    percentages: number[],
  ): 'OK' | 'WARN' | 'EXCEEDED' {
    const maxPercentage = Math.max(...percentages);
    const thresholds = this.planQuotaConfig.getThresholds();

    if (maxPercentage >= thresholds.exceededThresholdPercentage) {
      return 'EXCEEDED';
    }

    if (maxPercentage >= thresholds.warnThresholdPercentage) {
      return 'WARN';
    }

    return 'OK';
  }

  /**
   * Get current month date range (ISO 8601 format)
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

  /**
   * Get quota limits for a specific user
   * Task 9.4A: Expose configured limits
   * Task 9.6A: Return plan-specific limits
   *
   * @param userId - User UUID
   * @returns Current quota limits for the user's plan
   */
  getQuotaLimits(userId: string): {
    maxTokensPerMonth: number;
    maxCostUsdPerMonth: number;
    maxTerminationsPerMonth: number;
    warnThresholdPercentage: number;
    exceededThresholdPercentage: number;
    planType: string;
  } {
    const userPlan = this.getUserPlan(userId);
    const planLimits = this.planQuotaConfig.getLimitsForPlan(userPlan);
    const thresholds = this.planQuotaConfig.getThresholds();

    return {
      maxTokensPerMonth: planLimits.maxTokensPerMonth,
      maxCostUsdPerMonth: planLimits.maxCostUsdPerMonth,
      maxTerminationsPerMonth: planLimits.maxTerminationsPerMonth,
      warnThresholdPercentage: thresholds.warnThresholdPercentage,
      exceededThresholdPercentage: thresholds.exceededThresholdPercentage,
      planType: userPlan || 'free',
    };
  }

  /**
   * Get all available plans (for admin/reference)
   * Task 9.6A: Expose plan definitions
   *
   * @returns All plan limits
   */
  getAllPlanLimits(): {
    free: {
      maxTokensPerMonth: number;
      maxCostUsdPerMonth: number;
      maxTerminationsPerMonth: number;
    };
    pro: {
      maxTokensPerMonth: number;
      maxCostUsdPerMonth: number;
      maxTerminationsPerMonth: number;
    };
    enterprise: {
      maxTokensPerMonth: number;
      maxCostUsdPerMonth: number;
      maxTerminationsPerMonth: number;
    };
  } {
    return this.planQuotaConfig.getAllPlans();
  }
}
