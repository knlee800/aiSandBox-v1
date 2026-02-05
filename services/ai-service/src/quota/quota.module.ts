import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QuotaService } from './quota.service';
import { ApiGatewayHttpClient } from '../clients/api-gateway-http.client';

/**
 * QuotaModule
 * Provides quota enforcement services
 * Task 5.1B: Hard Quota Enforcement
 */
@Module({
  imports: [HttpModule],
  providers: [QuotaService, ApiGatewayHttpClient],
  exports: [QuotaService],
})
export class QuotaModule {}
