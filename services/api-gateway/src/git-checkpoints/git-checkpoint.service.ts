import { Injectable } from '@nestjs/common';
import { GitCheckpointRepository } from '../repositories/git-checkpoint.repository';
import { GitCheckpoint } from '../entities/git-checkpoint.entity';

/**
 * GitCheckpointService
 * Business logic for git checkpoint tracking
 * Append-only ledger for version control history
 * NO git execution logic - only recording
 */
@Injectable()
export class GitCheckpointService {
  constructor(
    private readonly gitCheckpointRepository: GitCheckpointRepository,
  ) {}

  /**
   * Record a git checkpoint after sandbox auto-commit
   * Creates immutable checkpoint entry for timeline navigation
   * @param data - Checkpoint data
   * @param data.sessionId - Session UUID (required)
   * @param data.commitHash - Git commit SHA (required)
   * @param data.messageNumber - Associated chat message number (optional)
   * @param data.description - Human-readable description (optional)
   * @param data.filesChanged - Number of files changed in commit (required)
   * @returns Created checkpoint record
   */
  async recordCheckpoint(data: {
    sessionId: string;
    commitHash: string;
    messageNumber?: number | null;
    description?: string | null;
    filesChanged: number;
  }): Promise<GitCheckpoint> {
    return await this.gitCheckpointRepository.recordCheckpoint({
      sessionId: data.sessionId,
      commitHash: data.commitHash,
      messageNumber: data.messageNumber ?? null,
      description: data.description ?? null,
      filesChanged: data.filesChanged,
    });
  }

  /**
   * Get checkpoint timeline for a session
   * Returns checkpoints in chronological order for timeline UI
   * @param sessionId - Session UUID
   * @returns Array of checkpoints (oldest first)
   */
  async getSessionTimeline(sessionId: string): Promise<GitCheckpoint[]> {
    return await this.gitCheckpointRepository.getCheckpointsBySession(
      sessionId,
    );
  }

  /**
   * Get checkpoint by commit hash
   * Useful for validating checkpoint existence before revert
   * @param commitHash - Git commit SHA
   * @returns Checkpoint or null
   */
  async getCheckpointByHash(
    commitHash: string,
  ): Promise<GitCheckpoint | null> {
    return await this.gitCheckpointRepository.getCheckpointByHash(commitHash);
  }

  /**
   * Get latest checkpoint for a session
   * Represents current state of the sandbox
   * @param sessionId - Session UUID
   * @returns Latest checkpoint or null if no checkpoints
   */
  async getLatestCheckpoint(
    sessionId: string,
  ): Promise<GitCheckpoint | null> {
    return await this.gitCheckpointRepository.getLatestCheckpoint(sessionId);
  }
}
