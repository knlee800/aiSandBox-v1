import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GitCheckpoint } from '../entities/git-checkpoint.entity';
import { GitCheckpointRepository } from '../repositories/git-checkpoint.repository';
import { GitCheckpointService } from './git-checkpoint.service';
import { InternalGitCheckpointController } from './internal-git-checkpoint.controller';

/**
 * GitCheckpointModule
 * Manages git checkpoint tracking and timeline persistence
 * Append-only ledger for version control history
 */
@Module({
  imports: [
    // Register GitCheckpoint entity for TypeORM
    TypeOrmModule.forFeature([GitCheckpoint]),
  ],
  controllers: [InternalGitCheckpointController],
  providers: [GitCheckpointRepository, GitCheckpointService],
  exports: [GitCheckpointService, GitCheckpointRepository],
})
export class GitCheckpointModule {}
