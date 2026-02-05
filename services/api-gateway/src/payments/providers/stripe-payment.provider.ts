import { Injectable } from '@nestjs/common';
import {
  PaymentProvider,
  InvoicePreview,
  ProviderInvoiceContext,
} from '../interfaces/payment-provider.interface';

/**
 * StripePaymentProvider (Task 10B2)
 * Stub implementation of payment provider abstraction
 *
 * CRITICAL CONSTRAINTS:
 * - Does NOT call Stripe API
 * - Does NOT require Stripe API keys
 * - Does NOT charge/capture/authorize/refund
 * - Returns placeholder values ONLY
 * - 100% safe to deploy (no side effects)
 *
 * Purpose:
 * - Establish provider abstraction pattern
 * - Prepare for future Stripe integration (Phase 10B3+)
 * - Enable provider metadata storage (non-functional)
 *
 * What is NOT implemented:
 * - ❌ Stripe SDK integration
 * - ❌ Customer creation
 * - ❌ Payment method attachment
 * - ❌ Invoice creation in Stripe
 * - ❌ Payment capture/charge
 * - ❌ Webhooks
 * - ❌ API key validation
 * - ❌ Network calls
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  constructor() {
    console.log(
      '[Task 10B2] StripePaymentProvider initialized (stub mode - NO API calls)',
    );
  }

  /**
   * Get provider name
   * Pure method, returns static string
   *
   * @returns Provider name ("stripe")
   */
  getProviderName(): string {
    return 'stripe';
  }

  /**
   * Prepare invoice for Stripe (preview mode only)
   * Task 10B2: Does NOT send invoice to Stripe
   * Does NOT make API calls
   * Returns placeholder metadata for future use
   *
   * In future phases (10B3+), this would:
   * - Create customer in Stripe (if not exists)
   * - Create invoice in Stripe
   * - Attach payment method
   * - Return actual Stripe IDs
   *
   * For now (10B2), this returns:
   * - externalCustomerId: null (no Stripe customer)
   * - externalInvoiceId: null (no Stripe invoice)
   * - status: 'not_sent' (placeholder)
   *
   * @param invoice - Invoice to prepare
   * @returns Provider invoice context (placeholder)
   */
  prepareInvoice(invoice: InvoicePreview): ProviderInvoiceContext {
    console.log(
      `[Task 10B2] Preparing invoice for user ${invoice.userId} (STUB - no API call)`,
    );
    console.log(
      `[Task 10B2] Invoice total: $${invoice.totalCostUsd} USD (NOT sent to Stripe)`,
    );

    // Return placeholder metadata (no actual Stripe operations)
    return {
      provider: 'stripe',
      externalCustomerId: null, // Would be Stripe customer ID
      externalInvoiceId: null, // Would be Stripe invoice ID
      status: 'not_sent', // Placeholder status
    };
  }

  /**
   * Validate provider configuration (static check only)
   * Task 10B2: Does NOT validate Stripe API keys
   * Does NOT make API calls
   * Always returns true (stub mode)
   *
   * In future phases (10B3+), this would:
   * - Check for STRIPE_SECRET_KEY env variable
   * - Validate API key format
   * - Optionally ping Stripe API for validation
   *
   * For now (10B2), this:
   * - Returns true (always valid in stub mode)
   *
   * @returns Configuration validity (always true)
   */
  validateConfiguration(): boolean {
    console.log(
      '[Task 10B2] Validating Stripe configuration (STUB - always returns true)',
    );
    return true;
  }
}
