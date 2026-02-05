import { Injectable } from '@nestjs/common';

/**
 * PlanQuotaConfig
 * Task 9.6A: Plan-Based Quota Configuration
 *
 * Defines quota limits per user plan (free, pro, enterprise).
 * Provides static plan definitions with runtime lookup.
 *
 * Source of truth: Static configuration in this file
 * Rationale: Simple, version-controlled, no database complexity
 * Pattern: Mirrors GovernanceConfig approach for consistency
 *
 * NO enforcement logic - configuration only.
 */

export interface PlanQuotaLimits {
  maxTokensPerMonth: number;
  maxCostUsdPerMonth: number;
  maxTerminationsPerMonth: number;
}

export type PlanType = 'free' | 'pro' | 'enterprise';

@Injectable()
export class PlanQuotaConfig {
  /**
   * Plan definitions (static, read-only)
   * Task 9.6A: Initial conservative defaults per plan
   */
  private readonly planLimits: Record<PlanType, PlanQuotaLimits> = {
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
  };

  /**
   * Default plan (fallback when plan lookup fails)
   */
  private readonly DEFAULT_PLAN: PlanType = 'free';

  /**
   * Status thresholds (unchanged from Task 9.4A)
   */
  readonly WARN_THRESHOLD_PERCENTAGE = 80.0;
  readonly EXCEEDED_THRESHOLD_PERCENTAGE = 100.0;

  constructor() {
    // Log configuration on startup
    console.log('✓ Plan quota config loaded:');
    console.log('  FREE plan:', this.planLimits.free);
    console.log('  PRO plan:', this.planLimits.pro);
    console.log('  ENTERPRISE plan:', this.planLimits.enterprise);
    console.log(`  Default fallback: ${this.DEFAULT_PLAN}`);
  }

  /**
   * Get quota limits for a specific plan
   * Task 9.6A: Dynamic plan-based limits
   *
   * @param planType - User's plan type
   * @returns Quota limits for the plan
   */
  getLimitsForPlan(planType: string | null | undefined): PlanQuotaLimits {
    // Normalize plan type to lowercase
    const normalizedPlan = planType?.toLowerCase();

    // Validate plan type
    if (
      normalizedPlan === 'free' ||
      normalizedPlan === 'pro' ||
      normalizedPlan === 'enterprise'
    ) {
      return this.planLimits[normalizedPlan];
    }

    // Fallback to FREE for unknown plans
    console.warn(
      `[PlanQuotaConfig] Unknown plan type "${planType}", falling back to FREE`,
    );
    return this.planLimits[this.DEFAULT_PLAN];
  }

  /**
   * Get all available plans (for reference/debugging)
   *
   * @returns Record of all plan limits
   */
  getAllPlans(): Record<PlanType, PlanQuotaLimits> {
    return { ...this.planLimits };
  }

  /**
   * Get default plan type
   *
   * @returns Default plan type used for fallback
   */
  getDefaultPlan(): PlanType {
    return this.DEFAULT_PLAN;
  }

  /**
   * Get status thresholds
   *
   * @returns WARN and EXCEEDED thresholds
   */
  getThresholds(): {
    warnThresholdPercentage: number;
    exceededThresholdPercentage: number;
  } {
    return {
      warnThresholdPercentage: this.WARN_THRESHOLD_PERCENTAGE,
      exceededThresholdPercentage: this.EXCEEDED_THRESHOLD_PERCENTAGE,
    };
  }
}
