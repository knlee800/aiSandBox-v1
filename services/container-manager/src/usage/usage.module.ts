import { Module } from '@nestjs/common';
import { UsageAggregationService } from './usage-aggregation.service';
import { InternalUsageAggregationController } from './internal-usage-aggregation.controller';
import { QuotaEvaluationService } from './quota-evaluation.service';
import { InternalQuotaEvaluationController } from './internal-quota-evaluation.controller';
import { InternalQuotaVisibilityController } from './internal-quota-visibility.controller';
import { PlanQuotaConfig } from '../config/plan-quota.config';

/**
 * UsageModule (Task 9.3B + Task 9.4A + Task 9.6A + Task 9.7A)
 * Provides read-only usage aggregation, quota evaluation, plan-based limits,
 * and quota visibility for future quota enforcement and billing integration
 */
@Module({
  controllers: [
    InternalUsageAggregationController,
    InternalQuotaEvaluationController,
    InternalQuotaVisibilityController,
  ],
  providers: [UsageAggregationService, QuotaEvaluationService, PlanQuotaConfig],
  exports: [UsageAggregationService, QuotaEvaluationService],
})
export class UsageModule {}
