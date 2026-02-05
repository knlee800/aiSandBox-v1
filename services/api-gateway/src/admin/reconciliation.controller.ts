import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ReconciliationService,
  InvoiceDriftReport,
  UserPeriodReconciliation,
  ReadyToChargeGate,
} from './reconciliation.service';

/**
 * ReconciliationController (Task 12A)
 * Internal-only endpoints for billing reconciliation and safety reports
 * Protected by InternalServiceAuthGuard (global guard)
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are READ-ONLY
 * - NO database writes
 * - NO schema changes
 * - NO payment provider calls
 * - NO invoice mutations
 * - Fail-soft on export failures (never 5xx)
 * - Internal service authentication required (X-Internal-Service-Key)
 *
 * Base path: /api/internal/admin/reconciliation
 *
 * Purpose:
 * Detect drift between invoice records and fresh billing export snapshots
 * Provide safety gates before enabling payment operations
 *
 * Endpoints:
 * 1. GET /invoices/:invoiceId - Invoice drift report
 * 2. GET /users/:userId/period - User period reconciliation summary
 * 3. GET /ready-to-charge - System ready-to-charge gate (advisory)
 */
@Controller('api/internal/admin/reconciliation')
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  /**
   * Get invoice drift report (Task 12A)
   * GET /api/internal/admin/reconciliation/invoices/:invoiceId
   *
   * Compares invoice record against fresh billing export snapshot
   *
   * Behavior:
   * - Load invoice by ID
   * - If status=void, return SKIPPED_VOID (no export needed)
   * - Otherwise fetch fresh export from container-manager
   * - Compute drift (tokens, cost, governance events)
   * - Flag mismatches based on thresholds
   * - Return structured report
   *
   * Thresholds:
   * - Tokens: exact match required (delta > 0 = mismatch)
   * - Cost: 0.01 USD tolerance (delta > 0.01 = mismatch)
   * - Governance: exact match required (delta > 0 = mismatch)
   *
   * Response statuses:
   * - OK: No drift detected
   * - DRIFT: Drift detected (flags indicate which fields)
   * - EXPORT_UNAVAILABLE: Export fetch failed (fail-soft)
   * - SKIPPED_VOID: Invoice is void (no export needed)
   *
   * Failure handling:
   * - Invoice not found → 404
   * - Export fetch fails → Returns EXPORT_UNAVAILABLE (not 5xx)
   *
   * @param invoiceId - Invoice ID (integer)
   * @returns Invoice drift report
   */
  @Get('invoices/:invoiceId')
  async getInvoiceDriftReport(
    @Param('invoiceId') invoiceId: string,
  ): Promise<InvoiceDriftReport> {
    // Validate invoice ID
    const id = parseInt(invoiceId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('invoiceId must be a valid integer');
    }

    // Get drift report (fail-soft on export failures)
    const report = await this.reconciliationService.getInvoiceDriftReport(id);

    if (!report) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return report;
  }

  /**
   * Get user period reconciliation summary (Task 12A)
   * GET /api/internal/admin/reconciliation/users/:userId/period
   *
   * Checks all invoices for a user in a given period
   *
   * Query parameters:
   * - startDate (required) - Period start (ISO 8601)
   * - endDate (required) - Period end (ISO 8601)
   *
   * Behavior:
   * - Query invoices for user in period (exact match on period_start/period_end)
   * - Run drift check on each invoice
   * - Aggregate results (totals, per-invoice rows)
   * - Return summary
   *
   * Failure handling:
   * - Per-invoice export failures don't fail entire response
   * - Missing query params → 400 Bad Request
   *
   * @param userId - User UUID
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns User period reconciliation summary
   */
  @Get('users/:userId/period')
  async getUserPeriodReconciliation(
    @Param('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<UserPeriodReconciliation> {
    // Validate userId
    if (!userId || userId.length === 0) {
      throw new BadRequestException('userId is required');
    }

    // Validate query params
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate query params are required');
    }

    // Get user period reconciliation (fail-soft)
    return this.reconciliationService.getUserPeriodReconciliation(
      userId,
      startDate,
      endDate,
    );
  }

  /**
   * Get ready-to-charge gate report (Task 12A)
   * GET /api/internal/admin/reconciliation/ready-to-charge
   *
   * Advisory gate to check if system is ready for payment operations
   *
   * Query parameters:
   * - startDate (required) - Period start (ISO 8601)
   * - endDate (required) - Period end (ISO 8601)
   *
   * Behavior:
   * - Scan all invoices in period with status != void
   * - Check for drift, export unavailable
   * - Mark ready: true ONLY if all invoices are clean (no drift, no export failures)
   * - Return blocking issues (specific invoices with problems)
   *
   * Ready criteria:
   * - All invoices are either draft or finalized
   * - NO drift detected (tokens, cost, governance match)
   * - NO export unavailable
   * - NO voided invoices in scan (excluded from query)
   *
   * This is purely advisory - no actions taken
   *
   * Failure handling:
   * - Missing query params → 400 Bad Request
   * - DB errors → Returns ready: false with SYSTEM_ERROR
   *
   * @param startDate - Period start (ISO 8601)
   * @param endDate - Period end (ISO 8601)
   * @returns Ready-to-charge gate report
   */
  @Get('ready-to-charge')
  async getReadyToChargeGate(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ReadyToChargeGate> {
    // Validate query params
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate query params are required');
    }

    // Get ready-to-charge gate (fail-soft)
    return this.reconciliationService.getReadyToChargeGate(startDate, endDate);
  }
}
