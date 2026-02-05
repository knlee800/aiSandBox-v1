import { Module } from '@nestjs/common';
import { BillingExportController } from './billing-export.controller';
import { UsageModule } from '../usage/usage.module';

/**
 * BillingModule (Task 10A)
 * Provides read-only billing data export for external billing systems
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are READ-ONLY
 * - No billing actions (no charging, no invoicing)
 * - No enforcement logic
 * - No mutations
 * - Internal service authentication required
 */
@Module({
  imports: [UsageModule],
  controllers: [BillingExportController],
  providers: [],
  exports: [],
})
export class BillingModule {}
