import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InvoicesService, Invoice } from './invoices.service';

/**
 * InvoicesController (Task 10B1)
 * Internal-only endpoints for invoice draft creation
 * Protected by InternalServiceAuthGuard (global guard)
 *
 * CRITICAL CONSTRAINTS:
 * - All endpoints are internal-only (/api/internal/invoices/*)
 * - NO charging, NO payment provider integration
 * - Idempotent draft creation
 * - Request-driven only (no background jobs)
 *
 * Endpoints:
 * - POST /api/internal/invoices/draft - Create invoice draft
 * - GET /api/internal/invoices/:invoiceId - Get invoice by ID
 * - GET /api/internal/invoices/by-key/:invoiceKey - Get invoice by key
 */
@Controller('api/internal/invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  /**
   * Create invoice draft (idempotent)
   * Task 10B1: POST /api/internal/invoices/draft
   *
   * Body:
   * {
   *   "userId": "string",
   *   "periodStart": "ISO 8601 string",
   *   "periodEnd": "ISO 8601 string"
   * }
   *
   * Behavior:
   * - Generates invoice_key from (userId, periodStart, periodEnd)
   * - Returns existing invoice if key already exists (idempotent)
   * - Calls container-manager billing export API
   * - Creates draft with zeros if export fails
   * - Returns created or existing invoice draft
   *
   * @param body - Request body
   * @returns Invoice draft
   */
  @Post('draft')
  async createInvoiceDraft(
    @Body() body: CreateInvoiceDraftDto,
  ): Promise<Invoice> {
    // Validate inputs
    if (!body.userId || !body.periodStart || !body.periodEnd) {
      throw new BadRequestException(
        'userId, periodStart, and periodEnd are required',
      );
    }

    // Validate ISO 8601 date format (basic check)
    try {
      new Date(body.periodStart);
      new Date(body.periodEnd);
    } catch (error) {
      throw new BadRequestException(
        'periodStart and periodEnd must be valid ISO 8601 dates',
      );
    }

    // Create invoice draft (idempotent)
    return this.invoicesService.createInvoiceDraft(
      body.userId,
      body.periodStart,
      body.periodEnd,
    );
  }

  /**
   * Get invoice by ID
   * Task 10B1: GET /api/internal/invoices/:invoiceId
   *
   * @param invoiceId - Invoice ID (integer)
   * @returns Invoice
   */
  @Get(':invoiceId')
  async getInvoiceById(@Param('invoiceId') invoiceId: string): Promise<Invoice> {
    // Parse invoice ID
    const id = parseInt(invoiceId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('invoiceId must be a valid integer');
    }

    // Get invoice
    const invoice = this.invoicesService.getInvoiceById(id);
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  /**
   * Get invoice by invoice_key
   * Task 10B1: GET /api/internal/invoices/by-key/:invoiceKey
   *
   * @param invoiceKey - Invoice key string
   * @returns Invoice
   */
  @Get('by-key/:invoiceKey')
  async getInvoiceByKey(
    @Param('invoiceKey') invoiceKey: string,
  ): Promise<Invoice> {
    // Get invoice
    const invoice = this.invoicesService.getInvoiceByKey(invoiceKey);
    if (!invoice) {
      throw new NotFoundException(
        `Invoice with key "${invoiceKey}" not found`,
      );
    }

    return invoice;
  }
}

/**
 * CreateInvoiceDraftDto (Task 10B1)
 * Request body for POST /api/internal/invoices/draft
 */
export interface CreateInvoiceDraftDto {
  userId: string;
  periodStart: string; // ISO 8601
  periodEnd: string; // ISO 8601
}
