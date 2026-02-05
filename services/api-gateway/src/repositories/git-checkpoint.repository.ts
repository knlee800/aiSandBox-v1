import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GitCheckpoint } from '../entities/git-checkpoint.entity';

/**
 * GitCheckpointRepository
 * Data access layer for GitCheckpoint entity
 * Append-only ledger for git commit tracking
 */
@Injectable()
export class GitCheckpointRepository {
  constructor(
    @InjectRepository(GitCheckpoint)
    private readonly repository: Repository<GitCheckpoint>,
  ) {}

  /**
   * Record a git checkpoint after auto-commit
   * Append-only operation - creates immutable checkpoint record
   * @param data - Checkpoint data
   * @returns Created checkpoint record
   */
  async recordCheckpoint(data: {
    sessionId: string;
    commitHash: string;
    messageNumber?: number | null;
    description?: string | null;
    filesChanged: number;
  }): Promise<GitCheckpoint> {
    const checkpoint = this.repository.create({
      sessionId: data.sessionId,
      commitHash: data.commitHash,
      messageNumber: data.messageNumber ?? null,
      description: data.description ?? null,
      filesChanged: data.filesChanged,
    });

    return await this.repository.save(checkpoint);
  }

  /**
   * Get all checkpoints for a session
   * Ordered chronologically (oldest first)
   * @param sessionId - Session UUID
   * @returns Array of checkpoints
   */
  async getCheckpointsBySession(sessionId: string): Promise<GitCheckpoint[]> {
    return await this.repository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get checkpoint by commit hash
   * @param commitHash - Git commit SHA
   * @returns Checkpoint or null
   */
  async getCheckpointByHash(
    commitHash: string,
  ): Promise<GitCheckpoint | null> {
    return await this.repository.findOne({
      where: { commitHash },
    });
  }

  /**
   * Get latest checkpoint for a session
   * @param sessionId - Session UUID
   * @returns Latest checkpoint or null
   */
  async getLatestCheckpoint(
    sessionId: string,
  ): Promise<GitCheckpoint | null> {
    return await this.repository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }
}
