import { Injectable } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { StripePaymentProvider } from '../payments/providers/stripe-payment.provider';

/**
 * ChargeReadinessService (Task 12B2)
 * Centralized financial safety gate that must pass before any charging operations
 *
 * CRITICAL PURPOSE:
 * This service provides a hard financial kill-switch that prevents accidental charging.
 * All future payment operations MUST call this gate and MUST NOT proceed if ready = false.
 *
 * CRITICAL CONSTRAINTS:
 * - This service does NOT execute charges
 * - This service does NOT create payment intents
 * - This service does NOT call Stripe SDK
 * - This service ONLY validates readiness conditions
 * - This service is a prerequisite safety check ONLY
 *
 * Design:
 * - Centralized gate logic that checks multiple safety conditions
 * - Explicit environment variable kill-switch (BILLING_CHARGES_ENABLED)
 * - Reuses ReconciliationService for drift detection
 * - Validates invoice status (must be finalized)
 * - Validates payment provider configuration
 * - Returns blocking reasons for debugging
 */
@Injectable()
export class ChargeReadinessService {
  // Hard financial kill-switch (default: false)
  private readonly chargesEnabled: boolean;

  constructor(
    private reconciliationService: ReconciliationService,
    private stripePaymentProvider: StripePaymentProvider,
  ) {
    // Read kill-switch from environment (default: false)
    this.chargesEnabled =
      process.env.BILLING_CHARGES_ENABLED === 'true' ? true : false;

    // Log kill-switch status on startup (critical visibility)
    if (this.chargesEnabled) {
      console.warn(
        '⚠️  [Task 12B2] BILLING_CHARGES_ENABLED=true (charging COULD be enabled, but not yet implemented)',
      );
    } else {
      console.log(
        '✅ [Task 12B2] BILLING_CHARGES_ENABLED=false (charging disabled, safe mode)',
      );
    }
  }

  /**
   * Check if a specific invoice is ready for charging (Task 12B2)
   * This is the central financial safety gate
   *
   * Gate conditions (ALL must pass):
   * 1. BILLING_CHARGES_ENABLED must be true (kill-switch)
   * 2. Invoice must exist
   * 3. Invoice status must be 'finalized' (not draft, not void)
   * 4. Reconciliation must pass:
   *    - status === "OK"
   *    - No drift flags (tokens, cost, governance)
   *    - Export available (not EXPORT_UNAVAILABLE)
   * 5. Payment provider configuration must be valid
   *
   * If ANY condition fails, returns ready: false with blocking reasons
   *
   * CRITICAL GUARANTEE:
   * This method does NOT charge, does NOT create payment intents, does NOT call Stripe.
   * This is ONLY a safety check.
   *
   * Usage:
   * Future charging code MUST call this gate before any payment operations:
   * ```
   * const gate = await chargeReadinessService.checkInvoiceChargeReadiness(invoiceId);
   * if (!gate.ready) {
   *   throw new Error(`Cannot charge: ${gate.blockingReasons.join(', ')}`);
   * }
   * // Only proceed if gate.ready === true
   * ```
   *
   * @param invoiceId - Invoice ID to check
   * @returns Charge readiness gate result
   */
  async checkInvoiceChargeReadiness(
    invoiceId: number,
  ): Promise<ChargeReadinessGate> {
    const blockingReasons: string[] = [];

    // 1. Check kill-switch (BILLING_CHARGES_ENABLED)
    if (!this.chargesEnabled) {
      blockingReasons.push(
        'BILLING_CHARGES_ENABLED=false (charging disabled at system level)',
      );
    }

    // 2. Run reconciliation check
    let reconciliationReport;
    try {
      reconciliationReport =
        await this.reconciliationService.getInvoiceDriftReport(invoiceId);
    } catch (error) {
      blockingReasons.push(
        `Reconciliation check failed: ${error.message || 'Unknown error'}`,
      );
      return {
        invoiceId,
        ready: false,
        blockingReasons,
      };
    }

    // 3. Check if invoice exists
    if (!reconciliationReport) {
      blockingReasons.push(`Invoice ${invoiceId} not found`);
      return {
        invoiceId,
        ready: false,
        blockingReasons,
      };
    }

    // 4. Check invoice status is 'finalized'
    if (reconciliationReport.invoice.status !== 'finalized') {
      blockingReasons.push(
        `Invoice status is '${reconciliationReport.invoice.status}' (expected 'finalized')`,
      );
    }

    // 5. Check invoice is not void (redundant with status check, but explicit)
    if (reconciliationReport.invoice.status === 'void') {
      blockingReasons.push('Invoice is void (cannot charge voided invoices)');
    }

    // 6. Check reconciliation status is OK
    if (reconciliationReport.status !== 'OK') {
      blockingReasons.push(
        `Reconciliation status is '${reconciliationReport.status}' (expected 'OK')`,
      );
    }

    // 7. Check for drift flags
    if (reconciliationReport.flags.highRiskDrift) {
      const driftReasons = [];
      if (reconciliationReport.flags.tokensMismatch)
        driftReasons.push('tokens mismatch');
      if (reconciliationReport.flags.costMismatch)
        driftReasons.push('cost mismatch');
      if (reconciliationReport.flags.governanceMismatch)
        driftReasons.push('governance mismatch');
      if (reconciliationReport.flags.exportUnavailable)
        driftReasons.push('export unavailable');

      blockingReasons.push(`Drift detected: ${driftReasons.join(', ')}`);
    }

    // 8. Check payment provider configuration
    const providerConfigValid =
      this.stripePaymentProvider.validateConfiguration();
    if (!providerConfigValid) {
      blockingReasons.push(
        'Payment provider configuration invalid (Stripe not configured)',
      );
    }

    // Determine readiness
    const ready = blockingReasons.length === 0;

    return {
      invoiceId,
      ready,
      blockingReasons,
    };
  }

  /**
   * Check if system-level charging is enabled (Task 12B2)
   * This is a simple kill-switch check
   *
   * Returns true ONLY if BILLING_CHARGES_ENABLED=true
   *
   * CRITICAL GUARANTEE:
   * Even if this returns true, NO charging happens in Task 12B2.
   * This is just a prerequisite check for future charging logic.
   *
   * @returns True if BILLING_CHARGES_ENABLED=true, false otherwise
   */
  isChargingEnabledAtSystemLevel(): boolean {
    return this.chargesEnabled;
  }

  /**
   * Get detailed system-level charge readiness (Task 12B2)
   * Returns comprehensive status about charging prerequisites
   *
   * This is useful for admin dashboards or monitoring
   *
   * @returns System-level charge readiness status
   */
  getSystemChargeReadiness(): SystemChargeReadiness {
    const blockingReasons: string[] = [];

    // Check kill-switch
    if (!this.chargesEnabled) {
      blockingReasons.push('BILLING_CHARGES_ENABLED=false');
    }

    // Check payment provider configuration
    const providerConfigValid =
      this.stripePaymentProvider.validateConfiguration();
    if (!providerConfigValid) {
      blockingReasons.push('Payment provider not configured');
    }

    const ready = blockingReasons.length === 0;

    return {
      chargesEnabledAtSystemLevel: this.chargesEnabled,
      paymentProviderConfigured: providerConfigValid,
      ready,
      blockingReasons,
    };
  }
}

/**
 * ChargeReadinessGate interface (Task 12B2)
 * Result of invoice-specific charge readiness check
 */
export interface ChargeReadinessGate {
  invoiceId: number;
  ready: boolean; // True if ALL conditions pass, false if ANY condition fails
  blockingReasons: string[]; // Human-readable reasons why charging is blocked
}

/**
 * SystemChargeReadiness interface (Task 12B2)
 * Result of system-level charge readiness check
 */
export interface SystemChargeReadiness {
  chargesEnabledAtSystemLevel: boolean; // BILLING_CHARGES_ENABLED value
  paymentProviderConfigured: boolean; // Payment provider config valid
  ready: boolean; // True if system is ready for charging (all prerequisites met)
  blockingReasons: string[]; // Human-readable reasons why charging is blocked
}
