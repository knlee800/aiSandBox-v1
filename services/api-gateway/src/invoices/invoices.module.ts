import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { ContainerManagerHttpClient } from '../clients/container-manager-http.client';
import { PaymentsModule } from '../payments/payments.module';

/**
 * InvoicesModule (Task 10B1 + Task 10B2)
 * Provides invoice draft creation with idempotent behavior
 *
 * CRITICAL CONSTRAINTS:
 * - Internal-only endpoints (protected by global InternalServiceAuthGuard)
 * - NO charging, NO payment provider integration
 * - Database writes ONLY for invoice draft persistence
 * - Request-driven only (no background jobs)
 *
 * Task 10B2 Changes:
 * - Imports PaymentsModule for provider abstraction
 * - Provider is injected but NOT executed during invoice creation
 */
@Module({
  imports: [PaymentsModule], // Task 10B2: Import payment provider abstraction
  controllers: [InvoicesController],
  providers: [InvoicesService, ContainerManagerHttpClient],
  exports: [InvoicesService],
})
export class InvoicesModule {}
