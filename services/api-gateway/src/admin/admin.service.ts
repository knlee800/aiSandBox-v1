import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import {
  ContainerManagerHttpClient,
  BillingUsageExport,
} from '../clients/container-manager-http.client';
import { ReconciliationService } from './reconciliation.service';

/**
 * AdminService (Task 11A + Task 11B + Task 12B1)
 * Handles internal admin visibility and mutation operations
 *
 * Task 11A: Read-only visibility endpoints
 * Task 11B: Invoice void action (status transition only)
 * Task 12B1: Invoice finalization (status transition with reconciliation check)
 *
 * CRITICAL CONSTRAINTS:
 * - Task 11A operations: READ-ONLY
 * - Task 11B operations: Status transitions only (draft → void)
 * - Task 12B1 operations: Status transitions only (draft → finalized, with reconciliation check)
 * - NO charging, NO payment provider calls, NO Stripe usage
 * - NO background jobs, NO retries
 * - Fail-soft on read operations, fail-hard on mutations
 * - Internal-only (protected by InternalServiceAuthGuard)
 */
@Injectable()
export class AdminService {
  private db: Database.Database;
  private readonly containerManagerBaseUrl: string;
  private readonly internalServiceKey: string;
  private axiosInstance: AxiosInstance;

  constructor(
    private containerManagerClient: ContainerManagerHttpClient,
    private reconciliationService: ReconciliationService,
  ) {
    // Connect to SQLite database (read-only operations)
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);

    // Setup axios for direct quota visibility API calls
    this.containerManagerBaseUrl =
      process.env.CONTAINER_MANAGER_URL || 'http://localhost:4002';
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY || '';

    this.axiosInstance = axios.create({
      baseURL: this.containerManagerBaseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get user ops summary (Task 11A)
   * Aggregates quota status and current usage from container-manager
   *
   * Data source: container-manager GET /api/internal/quota-visibility/user/:userId
   *
   * Returns:
   * - userId
   * - planType
   * - quotaStatus (OK/WARN/EXCEEDED/UNKNOWN)
   * - currentMonthUsage (tokens, cost, terminations)
   * - quotaLimits
   * - period boundaries
   *
   * Failure handling: Returns UNKNOWN status with empty usage on error
   */
  async getUserOpsSummary(userId: string): Promise<UserOpsSummary> {
    try {
      const response = await this.axiosInstance.get(
        `/api/internal/quota-visibility/user/${userId}`,
        {
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      );

      const data = response.data;

      return {
        userId: data.userId,
        planType: data.planType,
        quotaStatus: data.quotaStatus,
        currentMonthUsage: {
          tokens: data.currentMonthUsage.tokens.used,
          costUsd: data.currentMonthUsage.cost.used,
          terminations: data.currentMonthUsage.terminations.count,
        },
        quotaLimits: {
          maxTokensPerMonth: data.planLimits.maxTokensPerMonth,
          maxCostUsdPerMonth: data.planLimits.maxCostUsdPerMonth,
          maxTerminationsPerMonth: data.planLimits.maxTerminationsPerMonth,
        },
        period: {
          start: data.period.start,
          end: data.period.end,
        },
      };
    } catch (error) {
      // Fail-soft: return UNKNOWN status with empty usage
      console.error(
        `[Task 11A] Failed to get user ops summary for ${userId}:`,
        axios.isAxiosError(error) ? error.response?.status : error,
      );

      return {
        userId,
        planType: 'free',
        quotaStatus: 'UNKNOWN',
        currentMonthUsage: {
          tokens: 0,
          costUsd: 0,
          terminations: 0,
        },
        quotaLimits: {
          maxTokensPerMonth: 100_000,
          maxCostUsdPerMonth: 5.0,
          maxTerminationsPerMonth: 20,
        },
        period: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * List invoices (Task 11A)
   * Query invoices table with filters
   *
   * Data source: api-gateway invoices table (read-only)
   *
   * Query params:
   * - userId (optional)
   * - status=draft (fixed, only drafts)
   * - startDate (optional)
   * - endDate (optional)
   * - limit (optional, default 50)
   * - offset (optional, default 0)
   *
   * Failure handling: Returns empty array on error
   */
  listInvoices(params: InvoiceListParams): Invoice[] {
    try {
      // Build SQL query dynamically
      let sql = 'SELECT * FROM invoices WHERE status = ?';
      const queryParams: any[] = ['draft'];

      // Add userId filter if provided
      if (params.userId) {
        sql += ' AND user_id = ?';
        queryParams.push(params.userId);
      }

      // Add date filters if provided
      if (params.startDate) {
        sql += ' AND period_start >= ?';
        queryParams.push(params.startDate);
      }

      if (params.endDate) {
        sql += ' AND period_end <= ?';
        queryParams.push(params.endDate);
      }

      // Add ordering
      sql += ' ORDER BY created_at DESC';

      // Add pagination
      const limit = params.limit || 50;
      const offset = params.offset || 0;
      sql += ' LIMIT ? OFFSET ?';
      queryParams.push(limit, offset);

      // Execute query
      const rows = this.db.prepare(sql).all(...queryParams) as InvoiceRow[];

      // Map rows to Invoice objects
      return rows.map((row) => this.mapRowToInvoice(row));
    } catch (error) {
      // Fail-soft: return empty array
      console.error('[Task 11A] Failed to list invoices:', error);
      return [];
    }
  }

  /**
   * Get invoice detail with billing export snapshot (Task 11A)
   * Returns invoice record + latest billing export (re-fetched, read-only)
   *
   * Data sources:
   * - Invoice: api-gateway invoices table
   * - Billing export: container-manager billing export API (re-fetched)
   *
   * Status flags:
   * - COMPLETE: Export successful
   * - INCOMPLETE: Export failed or missing
   *
   * Failure handling: Returns invoice with INCOMPLETE status if export fails
   * Returns null if invoice not found
   */
  async getInvoiceDetail(invoiceId: number): Promise<InvoiceDetail | null> {
    try {
      // Get invoice from database
      const invoice = this.db
        .prepare('SELECT * FROM invoices WHERE id = ?')
        .get(invoiceId) as InvoiceRow | undefined;

      if (!invoice) {
        return null;
      }

      // Re-fetch billing export snapshot (read-only)
      const billingExport = await this.containerManagerClient.getBillingUsageExport(
        invoice.user_id,
        invoice.period_start,
        invoice.period_end,
      );

      // Determine completeness status
      const status = billingExport ? 'COMPLETE' : 'INCOMPLETE';

      return {
        invoice: this.mapRowToInvoice(invoice),
        billingExportSnapshot: billingExport || null,
        status,
      };
    } catch (error) {
      // Fail-soft: return null
      console.error(
        `[Task 11A] Failed to get invoice detail for ID ${invoiceId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Void invoice (Task 11B)
   * Admin action to mark a draft invoice as void
   *
   * State transition rules:
   * - draft → void (ALLOWED)
   * - finalized → void (FORBIDDEN, returns error)
   * - void → anything (FORBIDDEN, returns error)
   *
   * Behavior:
   * 1. Load invoice by ID
   * 2. Validate status is 'draft'
   * 3. Update status to 'void', set voided_at and voided_by
   * 4. Return updated invoice
   *
   * CRITICAL CONSTRAINTS:
   * - NO charging, NO payment provider calls
   * - NO external side effects
   * - Status transition only
   * - Fully auditable via voided_at and voided_by
   *
   * @param invoiceId - Invoice ID (integer)
   * @param adminActor - Admin identifier (from X-Admin-Actor header)
   * @returns Updated invoice with void status
   * @throws Error if invoice not found, not in draft status, or DB failure
   */
  voidInvoice(invoiceId: number, adminActor: string): Invoice {
    // Get invoice from database
    const invoice = this.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as InvoiceRow | undefined;

    // Invoice not found
    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    // Validate status is 'draft' (only draft invoices can be voided)
    if (invoice.status !== 'draft') {
      throw new Error(
        `Invoice with ID ${invoiceId} cannot be voided (status: ${invoice.status}, only 'draft' invoices can be voided)`,
      );
    }

    // Update invoice status to 'void'
    const voidedAt = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        UPDATE invoices
        SET status = ?,
            voided_at = ?,
            voided_by = ?
        WHERE id = ?
      `);

      stmt.run('void', voidedAt, adminActor, invoiceId);

      console.log(
        `[Task 11B] Invoice ${invoiceId} voided by ${adminActor} at ${voidedAt}`,
      );

      // Fetch and return updated invoice
      const updatedInvoice = this.db
        .prepare('SELECT * FROM invoices WHERE id = ?')
        .get(invoiceId) as InvoiceRow;

      return this.mapRowToInvoice(updatedInvoice);
    } catch (error) {
      // Database failure
      console.error(`[Task 11B] Failed to void invoice ${invoiceId}:`, error);
      throw new Error(
        `Failed to void invoice ${invoiceId}: ${error.message || 'Database error'}`,
      );
    }
  }

  /**
   * Finalize invoice (Task 12B1)
   * Admin action to mark a draft invoice as finalized (ready for payment processing)
   *
   * State transition rules:
   * - draft → finalized (ALLOWED, with reconciliation check)
   * - finalized → finalized (FORBIDDEN, returns error)
   * - void → finalized (FORBIDDEN, returns error)
   *
   * Finalization preconditions (MANDATORY):
   * 1. Invoice exists
   * 2. Invoice status is 'draft'
   * 3. Invoice is NOT void
   * 4. Reconciliation check MUST pass:
   *    - status === "OK"
   *    - No drift flags (tokens, cost, governance)
   *    - No export unavailable flags
   *
   * Behavior:
   * 1. Load invoice by ID
   * 2. Validate status is 'draft'
   * 3. Run reconciliation check (calls ReconciliationService)
   * 4. If reconciliation OK, update status to 'finalized', set finalized_at and finalized_by
   * 5. Return updated invoice
   *
   * CRITICAL CONSTRAINTS:
   * - NO charging, NO payment provider calls
   * - NO external side effects (beyond reconciliation check)
   * - Status transition only
   * - Fully auditable via finalized_at and finalized_by
   * - Reconciliation MUST pass (no drift, export available)
   *
   * @param invoiceId - Invoice ID (integer)
   * @param adminActor - Admin identifier (from X-Admin-Actor header)
   * @returns Updated invoice with finalized status
   * @throws Error if invoice not found, not in draft status, reconciliation fails, or DB failure
   */
  async finalizeInvoice(
    invoiceId: number,
    adminActor: string,
  ): Promise<Invoice> {
    // Get invoice from database
    const invoice = this.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as InvoiceRow | undefined;

    // Invoice not found
    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    // Validate status is 'draft' (only draft invoices can be finalized)
    if (invoice.status !== 'draft') {
      throw new Error(
        `Invoice with ID ${invoiceId} cannot be finalized (status: ${invoice.status}, only 'draft' invoices can be finalized)`,
      );
    }

    // Run reconciliation check (mandatory)
    console.log(
      `[Task 12B1] Running reconciliation check for invoice ${invoiceId}`,
    );
    const reconciliationReport =
      await this.reconciliationService.getInvoiceDriftReport(invoiceId);

    if (!reconciliationReport) {
      throw new Error(
        `Invoice with ID ${invoiceId} reconciliation failed: report unavailable`,
      );
    }

    // Validate reconciliation status is OK
    if (reconciliationReport.status !== 'OK') {
      throw new Error(
        `Invoice with ID ${invoiceId} cannot be finalized: reconciliation status is ${reconciliationReport.status} (expected OK)`,
      );
    }

    // Validate no drift flags
    if (reconciliationReport.flags.highRiskDrift) {
      const reasons = [];
      if (reconciliationReport.flags.tokensMismatch) reasons.push('tokens mismatch');
      if (reconciliationReport.flags.costMismatch) reasons.push('cost mismatch');
      if (reconciliationReport.flags.governanceMismatch)
        reasons.push('governance mismatch');
      if (reconciliationReport.flags.exportUnavailable)
        reasons.push('export unavailable');

      throw new Error(
        `Invoice with ID ${invoiceId} cannot be finalized: drift detected (${reasons.join(', ')})`,
      );
    }

    // Update invoice status to 'finalized'
    const finalizedAt = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        UPDATE invoices
        SET status = ?,
            finalized_at = ?,
            finalized_by = ?
        WHERE id = ?
      `);

      stmt.run('finalized', finalizedAt, adminActor, invoiceId);

      console.log(
        `[Task 12B1] Invoice ${invoiceId} finalized by ${adminActor} at ${finalizedAt}`,
      );

      // Fetch and return updated invoice
      const updatedInvoice = this.db
        .prepare('SELECT * FROM invoices WHERE id = ?')
        .get(invoiceId) as InvoiceRow;

      return this.mapRowToInvoice(updatedInvoice);
    } catch (error) {
      // Database failure
      console.error(
        `[Task 12B1] Failed to finalize invoice ${invoiceId}:`,
        error,
      );
      throw new Error(
        `Failed to finalize invoice ${invoiceId}: ${error.message || 'Database error'}`,
      );
    }
  }

  /**
   * Map database row to Invoice interface
   * Private helper method
   * Task 11B: Added voided_at and voided_by mapping
   * Task 12B1: Added finalized_at and finalized_by mapping
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
      paymentProvider: row.payment_provider || null,
      providerCustomerId: row.provider_customer_id || null,
      providerInvoiceId: row.provider_invoice_id || null,
      voidedAt: row.voided_at || null, // Task 11B: Nullable audit field
      voidedBy: row.voided_by || null, // Task 11B: Nullable audit field
      finalizedAt: row.finalized_at || null, // Task 12B1: Nullable audit field
      finalizedBy: row.finalized_by || null, // Task 12B1: Nullable audit field
      createdAt: row.created_at,
    };
  }
}

/**
 * UserOpsSummary interface (Task 11A)
 * Response type for user ops summary endpoint
 */
export interface UserOpsSummary {
  userId: string;
  planType: string;
  quotaStatus: 'OK' | 'WARN' | 'EXCEEDED' | 'UNKNOWN';
  currentMonthUsage: {
    tokens: number;
    costUsd: number;
    terminations: number;
  };
  quotaLimits: {
    maxTokensPerMonth: number;
    maxCostUsdPerMonth: number;
    maxTerminationsPerMonth: number;
  };
  period: {
    start: string;
    end: string;
  };
}

/**
 * Invoice interface (Task 11A + Task 11B + Task 12B1)
 * Public invoice representation (same as InvoicesService)
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
  paymentProvider: string | null;
  providerCustomerId: string | null;
  providerInvoiceId: string | null;
  voidedAt: string | null; // Task 11B: ISO 8601 timestamp when voided
  voidedBy: string | null; // Task 11B: Admin identifier who voided
  finalizedAt: string | null; // Task 12B1: ISO 8601 timestamp when finalized
  finalizedBy: string | null; // Task 12B1: Admin identifier who finalized
  createdAt: string;
}

/**
 * InvoiceRow interface (Task 11A + Task 11B + Task 12B1)
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
  payment_provider: string | null;
  provider_customer_id: string | null;
  provider_invoice_id: string | null;
  voided_at: string | null; // Task 11B: ISO 8601 timestamp when voided
  voided_by: string | null; // Task 11B: Admin identifier who voided
  finalized_at: string | null; // Task 12B1: ISO 8601 timestamp when finalized
  finalized_by: string | null; // Task 12B1: Admin identifier who finalized
  created_at: string;
}

/**
 * InvoiceListParams interface (Task 11A)
 * Query parameters for invoice list endpoint
 */
export interface InvoiceListParams {
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * InvoiceDetail interface (Task 11A)
 * Response type for invoice detail endpoint
 */
export interface InvoiceDetail {
  invoice: Invoice;
  billingExportSnapshot: BillingUsageExport | null;
  status: 'COMPLETE' | 'INCOMPLETE';
}
