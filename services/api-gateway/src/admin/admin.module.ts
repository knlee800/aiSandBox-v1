import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ChargeReadinessService } from './charge-readiness.service';
import { ContainerManagerHttpClient } from '../clients/container-manager-http.client';
import { PaymentsModule } from '../payments/payments.module';

/**
 * AdminModule (Task 11A + Task 11B + Task 12A + Task 12B1 + Task 12B2)
 * Provides internal admin visibility, invoice mutations, reconciliation, and charge readiness
 *
 * Task 11A: Read-only visibility (user ops, invoice listing)
 * Task 11B: Invoice void action (status transition)
 * Task 12A: Billing reconciliation and safety reports (read-only)
 * Task 12B1: Invoice finalization (status transition with reconciliation check)
 * Task 12B2: Charge readiness gate and financial kill-switch (safety only, no charging)
 *
 * CRITICAL CONSTRAINTS:
 * - Task 11A/12A endpoints: READ-ONLY
 * - Task 11B endpoints: Status transitions only (draft → void)
 * - Task 12B1 endpoints: Status transitions only (draft → finalized, with reconciliation check)
 * - Task 12B2: NO charging, NO payment execution, safety gate only
 * - NO background jobs
 * - Protected by InternalServiceAuthGuard (global)
 *
 * Dependencies:
 * - ContainerManagerHttpClient: For calling quota visibility and billing export APIs
 * - ReconciliationService: For drift detection (used by finalization and charge readiness)
 * - PaymentsModule: For payment provider configuration validation (used by charge readiness)
 *
 * Exports:
 * - AdminService (for potential future internal use)
 * - ReconciliationService (for potential future internal use)
 * - ChargeReadinessService (for future charging logic, MUST be called before any payment operations)
 */
@Module({
  imports: [PaymentsModule],
  controllers: [AdminController, ReconciliationController],
  providers: [
    AdminService,
    ReconciliationService,
    ChargeReadinessService,
    ContainerManagerHttpClient,
  ],
  exports: [AdminService, ReconciliationService, ChargeReadinessService],
})
export class AdminModule {}
