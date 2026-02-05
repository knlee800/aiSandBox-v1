import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  AdminService,
  UserOpsSummary,
  Invoice,
  InvoiceDetail,
} from './admin.service';

/**
 * AdminController (Task 11A + Task 11B + Task 12B1)
 * Internal-only endpoints for admin visibility and invoice mutations
 * Protected by InternalServiceAuthGuard (global guard)
 *
 * Task 11A: Read-only visibility endpoints
 * Task 11B: Invoice void action (status transition only)
 * Task 12B1: Invoice finalization (status transition with reconciliation check)
 *
 * CRITICAL CONSTRAINTS:
 * - Task 11A endpoints: READ-ONLY
 * - Task 11B endpoints: Status transitions only (draft → void)
 * - Task 12B1 endpoints: Status transitions only (draft → finalized, with reconciliation check)
 * - NO charging, NO payment provider calls, NO Stripe usage
 * - NO background jobs, NO retries
 * - NO behavior changes to Phase 9 or Phase 10 logic
 * - Internal service authentication required (X-Internal-Service-Key)
 *
 * Base path: /api/internal/admin
 *
 * Endpoints:
 * 1. GET /users/:userId/summary - User ops summary (quota, usage, limits)
 * 2. GET /invoices - List draft invoices with filters
 * 3. GET /invoices/:invoiceId - Invoice detail with billing export snapshot
 * 4. POST /invoices/:invoiceId/void - Void a draft invoice (Task 11B)
 * 5. POST /invoices/:invoiceId/finalize - Finalize a draft invoice (Task 12B1)
 *
 * FAILURE HANDLING:
 * - Fail-soft on read operations (return empty/INCOMPLETE/UNKNOWN)
 * - Fail-hard on mutations (throw 404/409/500)
 * - Safe to call repeatedly (idempotent-safe)
 * - Deterministic responses
 */
@Controller('api/internal/admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  /**
   * Get user ops summary (Task 11A)
   * GET /api/internal/admin/users/:userId/summary
   *
   * Returns aggregated quota status and current usage:
   * - userId
   * - planType (free/pro/enterprise)
   * - quotaStatus (OK/WARN/EXCEEDED/UNKNOWN)
   * - currentMonthUsage (tokens, cost, terminations)
   * - quotaLimits (max values)
   * - period boundaries
   *
   * Data source: container-manager quota visibility API
   *
   * Failure handling: Returns UNKNOWN status with empty usage
   *
   * @param userId - User UUID
   * @returns User ops summary
   */
  @Get('users/:userId/summary')
  async getUserOpsSummary(
    @Param('userId') userId: string,
  ): Promise<UserOpsSummary> {
    // Validate userId format (basic check)
    if (!userId || userId.length === 0) {
      throw new BadRequestException('userId is required');
    }

    // Get user ops summary (fail-soft)
    return this.adminService.getUserOpsSummary(userId);
  }

  /**
   * List invoices (Task 11A)
   * GET /api/internal/admin/invoices
   *
   * Query parameters:
   * - userId (optional) - Filter by user
   * - startDate (optional) - Filter by period_start >= startDate
   * - endDate (optional) - Filter by period_end <= endDate
   * - limit (optional, default 50) - Pagination limit
   * - offset (optional, default 0) - Pagination offset
   *
   * Status: Fixed to 'draft' only
   *
   * Data source: api-gateway invoices table (read-only)
   *
   * Failure handling: Returns empty array on error
   *
   * @param userId - Optional user ID filter
   * @param startDate - Optional period start filter (ISO 8601)
   * @param endDate - Optional period end filter (ISO 8601)
   * @param limit - Optional pagination limit
   * @param offset - Optional pagination offset
   * @returns Array of draft invoices
   */
  @Get('invoices')
  listInvoices(
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Invoice[] {
    // Parse pagination params
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    // Validate pagination params
    if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 1000) {
      throw new BadRequestException('limit must be between 1 and 1000');
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      throw new BadRequestException('offset must be >= 0');
    }

    // List invoices (fail-soft)
    return this.adminService.listInvoices({
      userId,
      startDate,
      endDate,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  /**
   * Get invoice detail with billing export snapshot (Task 11A)
   * GET /api/internal/admin/invoices/:invoiceId
   *
   * Returns:
   * - invoice: Invoice record from database
   * - billingExportSnapshot: Latest billing export (re-fetched, read-only)
   * - status: COMPLETE (export ok) or INCOMPLETE (export failed)
   *
   * Data sources:
   * - Invoice: api-gateway invoices table
   * - Billing export: container-manager billing export API (re-fetched)
   *
   * IMPORTANT: This endpoint does NOT modify the invoice row
   *
   * Failure handling:
   * - Invoice not found -> 404
   * - Billing export fails -> Returns INCOMPLETE status with null export
   *
   * @param invoiceId - Invoice ID (integer)
   * @returns Invoice detail with billing export snapshot
   */
  @Get('invoices/:invoiceId')
  async getInvoiceDetail(
    @Param('invoiceId') invoiceId: string,
  ): Promise<InvoiceDetail> {
    // Parse invoice ID
    const id = parseInt(invoiceId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('invoiceId must be a valid integer');
    }

    // Get invoice detail (fail-soft on export, but 404 if invoice not found)
    const invoiceDetail = await this.adminService.getInvoiceDetail(id);

    if (!invoiceDetail) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoiceDetail;
  }

  /**
   * Void invoice (Task 11B)
   * POST /api/internal/admin/invoices/:invoiceId/void
   *
   * Admin action to mark a draft invoice as void
   *
   * State transition rules:
   * - draft → void (ALLOWED)
   * - finalized → void (FORBIDDEN, returns 409)
   * - void → anything (FORBIDDEN, returns 409)
   *
   * Request headers:
   * - X-Admin-Actor (required) - Admin identifier for audit trail
   *
   * Response:
   * - id: Invoice ID
   * - status: 'void'
   * - voidedAt: ISO 8601 timestamp
   * - voidedBy: Admin identifier
   *
   * CRITICAL CONSTRAINTS:
   * - NO charging, NO payment provider calls
   * - NO external side effects
   * - Status transition only
   * - Fully auditable via voided_at and voided_by
   * - Idempotent-safe (second void attempt returns 409)
   *
   * Failure semantics:
   * - Invoice not found → 404
   * - Invoice already void → 409 Conflict
   * - Invoice finalized → 409 Conflict
   * - Missing X-Admin-Actor → 400 Bad Request
   * - DB failure → 500 Internal Server Error
   *
   * @param invoiceId - Invoice ID (integer)
   * @param adminActor - Admin identifier from X-Admin-Actor header
   * @returns Voided invoice with audit metadata
   */
  @Post('invoices/:invoiceId/void')
  voidInvoice(
    @Param('invoiceId') invoiceId: string,
    @Headers('x-admin-actor') adminActor: string,
  ): VoidInvoiceResponse {
    // Validate invoice ID
    const id = parseInt(invoiceId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('invoiceId must be a valid integer');
    }

    // Validate X-Admin-Actor header
    if (!adminActor || adminActor.trim().length === 0) {
      throw new BadRequestException(
        'X-Admin-Actor header is required for audit trail',
      );
    }

    try {
      // Void invoice (throws on validation failure)
      const voidedInvoice = this.adminService.voidInvoice(id, adminActor);

      // Return success response
      return {
        id: voidedInvoice.id,
        status: 'void',
        voidedAt: voidedInvoice.voidedAt!,
        voidedBy: voidedInvoice.voidedBy!,
      };
    } catch (error) {
      // Handle specific error cases
      const errorMessage = error.message || 'Unknown error';

      // Invoice not found (404)
      if (errorMessage.includes('not found')) {
        throw new NotFoundException(`Invoice with ID ${id} not found`);
      }

      // Invalid status transition (409)
      if (errorMessage.includes('cannot be voided')) {
        throw new ConflictException(errorMessage);
      }

      // Database failure (500)
      console.error(`[Task 11B] Failed to void invoice ${id}:`, error);
      throw new InternalServerErrorException(
        `Failed to void invoice ${id}: Database error`,
      );
    }
  }

  /**
   * Finalize invoice (Task 12B1)
   * POST /api/internal/admin/invoices/:invoiceId/finalize
   *
   * Admin action to mark a draft invoice as finalized (ready for payment processing)
   *
   * State transition rules:
   * - draft → finalized (ALLOWED, with reconciliation check)
   * - finalized → finalized (FORBIDDEN, returns 409)
   * - void → finalized (FORBIDDEN, returns 409)
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
   * Request headers:
   * - X-Admin-Actor (required) - Admin identifier for audit trail
   *
   * Response:
   * - id: Invoice ID
   * - status: 'finalized'
   * - finalizedAt: ISO 8601 timestamp
   * - finalizedBy: Admin identifier
   *
   * CRITICAL CONSTRAINTS:
   * - NO charging, NO payment provider calls
   * - NO external side effects (beyond reconciliation check)
   * - Status transition only
   * - Fully auditable via finalized_at and finalized_by
   * - Reconciliation MUST pass (no drift, export available)
   * - Idempotent-safe (second finalize attempt returns 409)
   *
   * Failure semantics:
   * - Invoice not found → 404
   * - Invoice already finalized → 409 Conflict
   * - Invoice is void → 409 Conflict
   * - Reconciliation status ≠ OK → 409 Conflict
   * - Drift detected → 409 Conflict
   * - Export unavailable → 409 Conflict
   * - Missing X-Admin-Actor → 400 Bad Request
   * - DB failure → 500 Internal Server Error
   *
   * @param invoiceId - Invoice ID (integer)
   * @param adminActor - Admin identifier from X-Admin-Actor header
   * @returns Finalized invoice with audit metadata
   */
  @Post('invoices/:invoiceId/finalize')
  async finalizeInvoice(
    @Param('invoiceId') invoiceId: string,
    @Headers('x-admin-actor') adminActor: string,
  ): Promise<FinalizeInvoiceResponse> {
    // Validate invoice ID
    const id = parseInt(invoiceId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('invoiceId must be a valid integer');
    }

    // Validate X-Admin-Actor header
    if (!adminActor || adminActor.trim().length === 0) {
      throw new BadRequestException(
        'X-Admin-Actor header is required for audit trail',
      );
    }

    try {
      // Finalize invoice (throws on validation failure or reconciliation failure)
      const finalizedInvoice = await this.adminService.finalizeInvoice(
        id,
        adminActor,
      );

      // Return success response
      return {
        id: finalizedInvoice.id,
        status: 'finalized',
        finalizedAt: finalizedInvoice.finalizedAt!,
        finalizedBy: finalizedInvoice.finalizedBy!,
      };
    } catch (error) {
      // Handle specific error cases
      const errorMessage = error.message || 'Unknown error';

      // Invoice not found (404)
      if (errorMessage.includes('not found')) {
        throw new NotFoundException(`Invoice with ID ${id} not found`);
      }

      // Invalid status transition (409)
      if (errorMessage.includes('cannot be finalized')) {
        throw new ConflictException(errorMessage);
      }

      // Reconciliation failed (409)
      if (errorMessage.includes('reconciliation')) {
        throw new ConflictException(errorMessage);
      }

      // Drift detected (409)
      if (errorMessage.includes('drift detected')) {
        throw new ConflictException(errorMessage);
      }

      // Database failure (500)
      console.error(`[Task 12B1] Failed to finalize invoice ${id}:`, error);
      throw new InternalServerErrorException(
        `Failed to finalize invoice ${id}: Database error`,
      );
    }
  }
}

/**
 * VoidInvoiceResponse interface (Task 11B)
 * Response type for POST /api/internal/admin/invoices/:invoiceId/void
 */
export interface VoidInvoiceResponse {
  id: number;
  status: 'void';
  voidedAt: string;
  voidedBy: string;
}

/**
 * FinalizeInvoiceResponse interface (Task 12B1)
 * Response type for POST /api/internal/admin/invoices/:invoiceId/finalize
 */
export interface FinalizeInvoiceResponse {
  id: number;
  status: 'finalized';
  finalizedAt: string;
  finalizedBy: string;
}
