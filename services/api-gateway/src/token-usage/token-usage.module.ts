import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsage } from '../entities/token-usage.entity';
import { TokenUsageRepository } from '../repositories/token-usage.repository';
import { TokenUsageService } from './token-usage.service';
import { TokenUsageController } from './token-usage.controller';
import { InternalTokenUsageController } from './internal-token-usage.controller';

/**
 * TokenUsageModule
 * Manages token usage tracking and ledger persistence
 * Append-only ledger for billing and quota enforcement
 * Exposes HTTP endpoints for ai-service integration
 */
@Module({
  imports: [
    // Register TokenUsage entity for TypeORM
    TypeOrmModule.forFeature([TokenUsage]),
  ],
  controllers: [TokenUsageController, InternalTokenUsageController],
  providers: [TokenUsageRepository, TokenUsageService],
  exports: [TokenUsageService, TokenUsageRepository],
})
export class TokenUsageModule {}
