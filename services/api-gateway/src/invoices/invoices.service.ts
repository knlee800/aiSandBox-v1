import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import {
  ContainerManagerHttpClient,
  BillingUsageExport,
} from '../clients/container-manager-http.client';
import { StripePaymentProvider } from '../payments/providers/stripe-payment.provider';

/**
 * InvoicesService (Task 10B1 + Task 10B2)
 * Handles invoice draft creation with idempotent behavior
 *
 * CRITICAL CONSTRAINTS:
 * - Idempotent draft creation using invoice_key
 * - NO charging, NO payment provider integration
 * - Fail-soft on billing export failures (create draft with zeros)
 * - Database writes ONLY for invoice draft persistence
 * - Request-driven only (no background jobs)
 *
 * Task 10B2 Changes:
 * - Added payment provider injection (non-executing)
 * - Provider is NOT invoked during invoice creation
 * - Provider metadata columns added to schema (nullable)
 * - No behavior changes to existing endpoints
 */
@Injectable()
export class InvoicesService {
  private db: Database.Database;

  constructor(
    private containerManagerClient: ContainerManagerHttpClient,
    private stripePaymentProvider: StripePaymentProvider, // Task 10B2: Injected but NOT used yet
  ) {
    // Connect to SQLite database
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);

    // Task 10B2: Validate provider configuration (static check only, no API calls)
    const isConfigValid = this.stripePaymentProvider.validateConfiguration();
    console.log(
      `[Task 10B2] Payment provider "${this.stripePaymentProvider.getProviderName()}" initialized (config valid: ${isConfigValid}, stub mode)`,
    );
  }

  /**
   * Generate invoice key for idempotency
   * Task 10B1: Format: "user:<userId>|start:<periodStart>|end:<periodEnd>"
   *
   * @param userId - User UUID
   * @param periodStart - Period start (ISO 8601)
   * @param periodEnd - Period end (ISO 8601)
   * @returns Invoice key string
   */
  private generateInvoiceKey(
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): string {
    return `user:${userId}|start:${periodStart}|end:${periodEnd}`;
  }

  /**
   * Create invoice draft with idempotent behavior
   * Task 10B1: Core invoice drafting logic
   * Task 10B2: No changes to draft creation behavior
   *
   * Behavior:
   * 1. Generate invoice_key from (userId, periodStart, periodEnd)
   * 2. Check if invoice with this key already exists -> return it
   * 3. Call container-manager billing export API
   * 4. If export fails -> create draft with zeros
   * 5. Insert invoice draft (idempotent on conflict)
   * 6. Return created or existing invoice
   *
   * @param userId - User UUID
   * @param periodStart - Period start (ISO 8601)
   * @param periodEnd - Period end (ISO 8601)
   * @returns Invoice draft
   */
  async createInvoiceDraft(
    userId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Invoice> {
    // Generate idempotency key
    const invoiceKey = this.generateInvoiceKey(userId, periodStart, periodEnd);

    // Check if invoice already exists (idempotent behavior)
    const existingInvoice = this.getInvoiceByKey(invoiceKey);
    if (existingInvoice) {
      console.log(
        `[Task 10B1] Invoice draft already exists for key: ${invoiceKey}`,
      );
      return existingInvoice;
    }

    // Fetch billing usage export from container-manager
    console.log(
      `[Task 10B1] Fetching billing export for user ${userId} (${periodStart} to ${periodEnd})`,
    );
    const billingExport = await this.containerManagerClient.getBillingUsageExport(
      userId,
      periodStart,
      periodEnd,
    );

    // Prepare invoice data (with zeros if export failed)
    let planType = 'free';
    let totalTokens = 0;
    let totalCostUsd = 0.0;
    let governanceEventsTotal = 0;

    if (billingExport) {
      planType = billingExport.planType;
      totalTokens = billingExport.tokenUsage.totalTokens;
      totalCostUsd = billingExport.costUsd;
      governanceEventsTotal = billingExport.governanceEvents.total;
      console.log(
        `[Task 10B1] Billing export successful: ${totalTokens} tokens, $${totalCostUsd} USD, ${governanceEventsTotal} governance events`,
      );
    } else {
      console.warn(
        `[Task 10B1] Billing export failed for user ${userId}, creating draft with zeros`,
      );
    }

    // Task 10B2: Provider metadata remains NULL (not set during draft creation)
    // Future phases (10B3+) will populate payment_provider, provider_customer_id, provider_invoice_id

    // Insert invoice draft
    try {
      const stmt = this.db.prepare(`
        INSERT INTO invoices (
          invoice_key,
          user_id,
          plan_type,
          period_start,
          period_end,
          currency,
          total_tokens,
          total_cost_usd,
          governance_events_total,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        invoiceKey,
        userId,
        planType,
        periodStart,
        periodEnd,
        'USD',
        totalTokens,
        totalCostUsd,
        governanceEventsTotal,
        'draft',
      );

      console.log(
        `[Task 10B1] Invoice draft created with ID: ${result.lastInsertRowid}`,
      );

      // Return created invoice
      return this.getInvoiceById(result.lastInsertRowid as number);
    } catch (error) {
      // Handle unique constraint violation (race condition)
      if (error.message.includes('UNIQUE constraint failed')) {
        console.warn(
          `[Task 10B1] Invoice key conflict detected, returning existing invoice`,
        );
        return this.getInvoiceByKey(invoiceKey);
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get invoice by ID
   * Task 10B1: Read-only lookup
   *
   * @param invoiceId - Invoice ID (integer)
   * @returns Invoice or null if not found
   */
  getInvoiceById(invoiceId: number): Invoice | null {
    const invoice = this.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as InvoiceRow | undefined;

    return invoice ? this.mapRowToInvoice(invoice) : null;
  }

  /**
   * Get invoice by invoice_key
   * Task 10B1: Read-only lookup for idempotency debugging
   *
   * @param invoiceKey - Invoice key string
   * @returns Invoice or null if not found
   */
  getInvoiceByKey(invoiceKey: string): Invoice | null {
    const invoice = this.db
      .prepare('SELECT * FROM invoices WHERE invoice_key = ?')
      .get(invoiceKey) as InvoiceRow | undefined;

    return invoice ? this.mapRowToInvoice(invoice) : null;
  }

  /**
   * Map database row to Invoice interface
   * Private helper method
   * Task 10B2: Added provider metadata fields
   * Task 11B: Added voided_at and voided_by fields
   * Task 12B1: Added finalized_at and finalized_by fields
   *
   * @param row - Database row
   * @returns Invoice object
   */
  private mapRowToInvoice(row: InvoiceRow): Invoice {
    return {
      id: row.id,
      invoiceKey: row.invoice_key,
      userId: row.user_id,
      planType: row.plan_type,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      currency: row.currency,
      totalTokens: row.total_tokens,
      totalCostUsd: row.total_cost_usd,
      governanceEventsTotal: row.governance_events_total,
      status: row.status,
      paymentProvider: row.payment_provider || null, // Task 10B2: Nullable
      providerCustomerId: row.provider_customer_id || null, // Task 10B2: Nullable
      providerInvoiceId: row.provider_invoice_id || null, // Task 10B2: Nullable
      voidedAt: row.voided_at || null, // Task 11B: Nullable audit field
      voidedBy: row.voided_by || null, // Task 11B: Nullable audit field
      finalizedAt: row.finalized_at || null, // Task 12B1: Nullable audit field
      finalizedBy: row.finalized_by || null, // Task 12B1: Nullable audit field
      createdAt: row.created_at,
    };
  }
}

/**
 * Invoice interface (Task 10B1 + Task 10B2 + Task 11B + Task 12B1)
 * Public invoice representation
 * Task 11B: Added voided_at and voided_by audit fields
 * Task 12B1: Added finalized_at and finalized_by audit fields
 */
export interface Invoice {
  id: number;
  invoiceKey: string;
  userId: string;
  planType: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  totalTokens: number;
  totalCostUsd: number;
  governanceEventsTotal: number;
  status: 'draft' | 'finalized' | 'void';
  paymentProvider: string | null; // Task 10B2: Provider name (e.g., 'stripe')
  providerCustomerId: string | null; // Task 10B2: External customer ID
  providerInvoiceId: string | null; // Task 10B2: External invoice ID
  voidedAt: string | null; // Task 11B: ISO 8601 timestamp when voided
  voidedBy: string | null; // Task 11B: Admin identifier who voided
  finalizedAt: string | null; // Task 12B1: ISO 8601 timestamp when finalized
  finalizedBy: string | null; // Task 12B1: Admin identifier who finalized
  createdAt: string;
}

/**
 * InvoiceRow interface (Task 10B1 + Task 10B2 + Task 11B + Task 12B1)
 * Database row representation (snake_case)
 * Task 11B: Added voided_at and voided_by audit fields
 * Task 12B1: Added finalized_at and finalized_by audit fields
 */
interface InvoiceRow {
  id: number;
  invoice_key: string;
  user_id: string;
  plan_type: string;
  period_start: string;
  period_end: string;
  currency: string;
  total_tokens: number;
  total_cost_usd: number;
  governance_events_total: number;
  status: 'draft' | 'finalized' | 'void';
  payment_provider: string | null; // Task 10B2: Nullable
  provider_customer_id: string | null; // Task 10B2: Nullable
  provider_invoice_id: string | null; // Task 10B2: Nullable
  voided_at: string | null; // Task 11B: ISO 8601 timestamp when voided
  voided_by: string | null; // Task 11B: Admin identifier who voided
  finalized_at: string | null; // Task 12B1: ISO 8601 timestamp when finalized
  finalized_by: string | null; // Task 12B1: Admin identifier who finalized
  created_at: string;
}
