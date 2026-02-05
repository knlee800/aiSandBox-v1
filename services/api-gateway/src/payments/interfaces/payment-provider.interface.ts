/**
 * PaymentProvider Interface (Task 10B2)
 * Abstraction layer for payment provider integrations
 *
 * CRITICAL CONSTRAINTS:
 * - All methods are pure/synchronous or return static data ONLY
 * - NO API calls to real payment providers
 * - NO charge/capture/authorize/refund operations
 * - NO webhooks, NO background jobs
 * - NO secrets required to function
 * - 100% safe to deploy (structural only)
 *
 * Purpose:
 * - Prepare for future payment integration (Phase 10B3+)
 * - Establish provider abstraction pattern
 * - Enable provider metadata storage (non-functional)
 */
export interface PaymentProvider {
  /**
   * Get provider name (e.g., "stripe", "mock")
   * Pure method, returns static string
   *
   * @returns Provider name
   */
  getProviderName(): string;

  /**
   * Prepare invoice for provider (preview mode only)
   * Does NOT send invoice to provider
   * Does NOT make API calls
   * Returns placeholder metadata for future use
   *
   * @param invoice - Invoice to prepare
   * @returns Provider invoice context (placeholder)
   */
  prepareInvoice(invoice: InvoicePreview): ProviderInvoiceContext;

  /**
   * Validate provider configuration (static check only)
   * Does NOT validate API keys or credentials
   * Returns true if provider can be instantiated
   *
   * @returns Configuration validity (always true for stubs)
   */
  validateConfiguration(): boolean;
}

/**
 * InvoicePreview (Task 10B2)
 * Minimal invoice data for provider preview
 */
export interface InvoicePreview {
  userId: string;
  planType: string;
  totalCostUsd: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * ProviderInvoiceContext (Task 10B2)
 * Placeholder metadata returned by provider preview
 *
 * CRITICAL: All fields are placeholders only
 * - externalCustomerId: Would be provider customer ID (null for now)
 * - externalInvoiceId: Would be provider invoice ID (null for now)
 * - status: Would be provider invoice status (always 'not_sent' for now)
 */
export interface ProviderInvoiceContext {
  provider: string;
  externalCustomerId: string | null;
  externalInvoiceId: string | null;
  status: 'not_sent';
}
