import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import {
  ContainerManagerHttpClient,
  BillingUsageExport,
} from '../clients/container-manager-http.client';

/**
 * ReconciliationService (Task 12A)
 * Handles billing reconciliation and safety reports
 *
 * CRITICAL CONSTRAINTS:
 * - READ-ONLY operations only (no database writes)
 * - NO schema changes
 * - NO background jobs
 * - NO payment provider calls
 * - NO invoice mutations
 * - Fail-soft on export failures (never 5xx)
 * - Internal-only (protected by InternalServiceAuthGuard)
 *
 * Purpose:
 * Detect drift between invoice records and fresh billing export snapshots
 * Provide safety gates before enabling payment operations
 */
@Injectable()
export class ReconciliationService {
  private db: Database.Database;

  // Drift thresholds (hard-coded for Task 12A)
  private readonly COST_TOLERANCE_USD = 0.01; // 1 cent tolerance
  private readonly TOKEN_TOLERANCE = 0; // Exact match required
  private readonly GOVERNANCE_TOLERANCE = 0; // Exact match required

  constructor(private containerManagerClient: ContainerManagerHttpClient) {
    // Connect to SQLite database (read-only operations)
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  /**
   * Get invoice drift report (Task 12A)
   * Compares invoice record against fresh billing export snapshot
   *
   * Behavior:
   * 1. Load invoice by ID
   * 2. If status=void, return SKIPPED_VOID (no export needed)
   * 3. Otherwise fetch fresh export from container-manager
   * 4. Compute drift (tokens, cost, governance events)
   * 5. Flag mismatches based on thresholds
   * 6. Return structured report
   *
   * Fail-soft: Export failures return EXPORT_UNAVAILABLE (not 5xx)
   *
   * @param invoiceId - Invoice ID (integer)
   * @returns Invoice drift report or null if invoice not found
   */
  async getInvoiceDriftReport(
    invoiceId: number,
  ): Promise<InvoiceDriftReport | null> {
    // Load invoice from database
    const invoice = this.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as InvoiceRow | undefined;

    if (!invoice) {
      return null;
    }

    // If invoice is void, skip export check (voided invoices don't need reconciliation)
    if (invoice.status === 'void') {
      return {
        invoiceId: invoice.id,
        status: 'SKIPPED_VOID',
        invoice: {
          userId: invoice.user_id,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          status: invoice.status,
        },
        export: null,
        drift: null,
        flags: {
          tokensMismatch: false,
          costMismatch: false,
          governanceMismatch: false,
          exportUnavailable: false,
          invoiceVoid: true,
          invoiceFinalized: invoice.status === 'finalized',
          highRiskDrift: false,
        },
      };
    }

    // Fetch fresh billing export snapshot
    const billingExport = await this.containerManagerClient.getBillingUsageExport(
      invoice.user_id,
      invoice.period_start,
      invoice.period_end,
    );

    // Export unavailable (fail-soft)
    if (!billingExport) {
      return {
        invoiceId: invoice.id,
        status: 'EXPORT_UNAVAILABLE',
        invoice: {
          userId: invoice.user_id,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          status: invoice.status,
        },
        export: null,
        drift: null,
        flags: {
          tokensMismatch: false,
          costMismatch: false,
          governanceMismatch: false,
          exportUnavailable: true,
          invoiceVoid: false,
          invoiceFinalized: invoice.status === 'finalized',
          highRiskDrift: true, // Export unavailable is high risk
        },
      };
    }

    // Compute drift
    const tokensDelta = invoice.total_tokens - billingExport.tokenUsage.totalTokens;
    const costDelta = invoice.total_cost_usd - billingExport.costUsd;
    const governanceDelta =
      invoice.governance_events_total - billingExport.governanceEvents.total;

    // Calculate percentage deltas (avoid divide by zero)
    const tokensDeltaPct =
      billingExport.tokenUsage.totalTokens > 0
        ? (tokensDelta / billingExport.tokenUsage.totalTokens) * 100
        : tokensDelta !== 0
          ? 100
          : 0;

    const costDeltaPct =
      billingExport.costUsd > 0
        ? (costDelta / billingExport.costUsd) * 100
        : costDelta !== 0
          ? 100
          : 0;

    // Flag mismatches based on thresholds
    const tokensMismatch = Math.abs(tokensDelta) > this.TOKEN_TOLERANCE;
    const costMismatch = Math.abs(costDelta) > this.COST_TOLERANCE_USD;
    const governanceMismatch = Math.abs(governanceDelta) > this.GOVERNANCE_TOLERANCE;

    const highRiskDrift = tokensMismatch || costMismatch || governanceMismatch;

    // Determine overall status
    const status = highRiskDrift ? 'DRIFT' : 'OK';

    return {
      invoiceId: invoice.id,
      status,
      invoice: {
        userId: invoice.user_id,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
        status: invoice.status,
      },
      export: {
        totalTokens: billingExport.tokenUsage.totalTokens,
        totalCostUsd: billingExport.costUsd,
        governanceEventsTotal: billingExport.governanceEvents.total,
      },
      drift: {
        tokens: {
          invoice: invoice.total_tokens,
          export: billingExport.tokenUsage.totalTokens,
          delta: tokensDelta,
          deltaPct: tokensDeltaPct,
        },
        costUsd: {
          invoice: invoice.total_cost_usd,
          export: billingExport.costUsd,
          delta: costDelta,
          deltaPct: costDeltaPct,
        },
        governanceEvents: {
          invoice: invoice.governance_events_total,
          export: billingExport.governanceEvents.total,
          delta: governanceDelta,
        },
      },
      flags: {
        tokensMismatch,
        costMismatch,
        governanceMismatch,
        exportUnavailable: false,
        invoiceVoid: false,
        invoiceFinalized: invoice.status === 'finalized',
        highRiskDrift,
      },
    };
  }

  /**
   * Get user period reconciliation summary (Task 12A)
   * Checks all invoices for a user in a given period
   *
   * Behavior:
   * 1. Query invoices for user in period (exact match on period_start/period_end)
   * 2. Run drift check on each invoice
   * 3. Aggregate results
   * 4. Return summary with totals
   *
   * Fail-soft: Per-invoice export failures don't fail entire response
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns User period reconciliation summary
   */
  async getUserPeriodReconciliation(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<UserPeriodReconciliation> {
    try {
      // Query invoices for user in period (exact match)
      const invoices = this.db
        .prepare(
          `SELECT * FROM invoices
           WHERE user_id = ?
           AND period_start = ?
           AND period_end = ?
           ORDER BY created_at DESC`,
        )
        .all(userId, startDate, endDate) as InvoiceRow[];

      // Initialize counters
      let invoicesChecked = 0;
      let invoicesWithDrift = 0;
      let invoicesSkippedVoid = 0;
      let exportsUnavailable = 0;

      // Run drift check on each invoice
      const invoiceReports: InvoiceReconciliationRow[] = [];

      for (const invoice of invoices) {
        invoicesChecked++;

        const report = await this.getInvoiceDriftReport(invoice.id);

        if (!report) {
          continue; // Should not happen (invoice exists in DB)
        }

        // Update counters
        if (report.status === 'SKIPPED_VOID') {
          invoicesSkippedVoid++;
        }

        if (report.status === 'EXPORT_UNAVAILABLE') {
          exportsUnavailable++;
        }

        if (report.status === 'DRIFT') {
          invoicesWithDrift++;
        }

        // Add compact row to results
        invoiceReports.push({
          invoiceId: invoice.id,
          status: report.status,
          invoiceStatus: invoice.status,
          drift: report.drift
            ? {
                tokens: report.drift.tokens.delta,
                costUsd: report.drift.costUsd.delta,
                governanceEvents: report.drift.governanceEvents.delta,
              }
            : null,
        });
      }

      return {
        userId,
        period: {
          start: startDate,
          end: endDate,
        },
        totals: {
          invoicesChecked,
          invoicesWithDrift,
          invoicesSkippedVoid,
          exportsUnavailable,
        },
        invoices: invoiceReports,
      };
    } catch (error) {
      // Fail-soft: return empty results on DB error
      console.error(
        `[Task 12A] Failed to get user period reconciliation for ${userId}:`,
        error,
      );

      return {
        userId,
        period: {
          start: startDate,
          end: endDate,
        },
        totals: {
          invoicesChecked: 0,
          invoicesWithDrift: 0,
          invoicesSkippedVoid: 0,
          exportsUnavailable: 0,
        },
        invoices: [],
      };
    }
  }

  /**
   * Get ready-to-charge gate report (Task 12A)
   * Advisory gate to check if system is ready for payment operations
   *
   * Behavior:
   * 1. Scan all invoices in period with status != void
   * 2. Check for drift, export unavailable
   * 3. Mark ready: true ONLY if all invoices are clean
   * 4. Return blocking issues
   *
   * This is purely advisory - no actions taken
   *
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Ready-to-charge gate report
   */
  async getReadyToChargeGate(
    startDate: string,
    endDate: string,
  ): Promise<ReadyToChargeGate> {
    try {
      // Query all invoices in period (exact match, status != void)
      const invoices = this.db
        .prepare(
          `SELECT * FROM invoices
           WHERE period_start = ?
           AND period_end = ?
           AND status != 'void'
           ORDER BY created_at DESC`,
        )
        .all(startDate, endDate) as InvoiceRow[];

      // Initialize counters
      let checked = 0;
      let drift = 0;
      let unavailable = 0;
      let skippedVoid = 0;

      const blockingIssues: BlockingIssue[] = [];

      // Check each invoice
      for (const invoice of invoices) {
        checked++;

        const report = await this.getInvoiceDriftReport(invoice.id);

        if (!report) {
          continue;
        }

        // Void invoices shouldn't be in this query, but handle anyway
        if (report.status === 'SKIPPED_VOID') {
          skippedVoid++;
          continue;
        }

        // Export unavailable
        if (report.status === 'EXPORT_UNAVAILABLE') {
          unavailable++;
          blockingIssues.push({
            invoiceId: invoice.id,
            reason: 'EXPORT_UNAVAILABLE',
          });
          continue;
        }

        // Drift detected
        if (report.status === 'DRIFT') {
          drift++;

          // Add specific drift reasons
          if (report.flags.tokensMismatch) {
            blockingIssues.push({
              invoiceId: invoice.id,
              reason: 'DRIFT_TOKENS',
            });
          }

          if (report.flags.costMismatch) {
            blockingIssues.push({
              invoiceId: invoice.id,
              reason: 'DRIFT_COST',
            });
          }

          if (report.flags.governanceMismatch) {
            blockingIssues.push({
              invoiceId: invoice.id,
              reason: 'DRIFT_GOVERNANCE',
            });
          }
        }
      }

      // System is ready ONLY if no blocking issues
      const ready = blockingIssues.length === 0;

      return {
        period: {
          start: startDate,
          end: endDate,
        },
        ready,
        blockingIssues,
        counts: {
          checked,
          drift,
          unavailable,
          skippedVoid,
        },
      };
    } catch (error) {
      // Fail-soft: return not-ready on DB error
      console.error('[Task 12A] Failed to get ready-to-charge gate:', error);

      return {
        period: {
          start: startDate,
          end: endDate,
        },
        ready: false,
        blockingIssues: [
          {
            invoiceId: 0,
            reason: 'SYSTEM_ERROR',
          },
        ],
        counts: {
          checked: 0,
          drift: 0,
          unavailable: 0,
          skippedVoid: 0,
        },
      };
    }
  }
}

/**
 * InvoiceRow interface (Task 12A)
 * Database row representation (snake_case)
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
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
}

/**
 * InvoiceDriftReport interface (Task 12A)
 * Response type for invoice drift report endpoint
 */
export interface InvoiceDriftReport {
  invoiceId: number;
  status: 'OK' | 'DRIFT' | 'EXPORT_UNAVAILABLE' | 'SKIPPED_VOID';
  invoice: {
    userId: string;
    periodStart: string;
    periodEnd: string;
    status: 'draft' | 'finalized' | 'void';
  };
  export: {
    totalTokens: number;
    totalCostUsd: number;
    governanceEventsTotal: number;
  } | null;
  drift: {
    tokens: {
      invoice: number;
      export: number;
      delta: number;
      deltaPct: number;
    };
    costUsd: {
      invoice: number;
      export: number;
      delta: number;
      deltaPct: number;
    };
    governanceEvents: {
      invoice: number;
      export: number;
      delta: number;
    };
  } | null;
  flags: {
    tokensMismatch: boolean;
    costMismatch: boolean;
    governanceMismatch: boolean;
    exportUnavailable: boolean;
    invoiceVoid: boolean;
    invoiceFinalized: boolean;
    highRiskDrift: boolean;
  };
}

/**
 * UserPeriodReconciliation interface (Task 12A)
 * Response type for user period reconciliation endpoint
 */
export interface UserPeriodReconciliation {
  userId: string;
  period: {
    start: string;
    end: string;
  };
  totals: {
    invoicesChecked: number;
    invoicesWithDrift: number;
    invoicesSkippedVoid: number;
    exportsUnavailable: number;
  };
  invoices: InvoiceReconciliationRow[];
}

/**
 * InvoiceReconciliationRow interface (Task 12A)
 * Compact invoice row for user period reconciliation
 */
export interface InvoiceReconciliationRow {
  invoiceId: number;
  status: 'OK' | 'DRIFT' | 'EXPORT_UNAVAILABLE' | 'SKIPPED_VOID';
  invoiceStatus: 'draft' | 'finalized' | 'void';
  drift: {
    tokens: number;
    costUsd: number;
    governanceEvents: number;
  } | null;
}

/**
 * ReadyToChargeGate interface (Task 12A)
 * Response type for ready-to-charge gate endpoint
 */
export interface ReadyToChargeGate {
  period: {
    start: string;
    end: string;
  };
  ready: boolean;
  blockingIssues: BlockingIssue[];
  counts: {
    checked: number;
    drift: number;
    unavailable: number;
    skippedVoid: number;
  };
}

/**
 * BlockingIssue interface (Task 12A)
 * Represents a blocking issue preventing charge readiness
 */
export interface BlockingIssue {
  invoiceId: number;
  reason:
    | 'DRIFT_TOKENS'
    | 'DRIFT_COST'
    | 'DRIFT_GOVERNANCE'
    | 'EXPORT_UNAVAILABLE'
    | 'SYSTEM_ERROR';
}
