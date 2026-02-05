import { Module } from '@nestjs/common';
import { StripePaymentProvider } from './providers/stripe-payment.provider';

/**
 * PaymentsModule (Task 10B2)
 * Payment provider abstraction layer
 *
 * CRITICAL CONSTRAINTS:
 * - NO API calls to real payment providers
 * - NO charge/capture/authorize/refund operations
 * - NO webhooks, NO background jobs
 * - 100% safe to deploy (structural only)
 *
 * Purpose:
 * - Establish provider abstraction pattern
 * - Prepare for future payment integration (Phase 10B3+)
 * - Enable provider metadata storage (non-functional)
 *
 * What is NOT implemented:
 * - ❌ Stripe SDK integration
 * - ❌ Payment capture/charge
 * - ❌ Customer creation
 * - ❌ Payment method attachment
 * - ❌ Webhooks
 * - ❌ Background jobs
 */
@Module({
  providers: [StripePaymentProvider],
  exports: [StripePaymentProvider],
})
export class PaymentsModule {}
