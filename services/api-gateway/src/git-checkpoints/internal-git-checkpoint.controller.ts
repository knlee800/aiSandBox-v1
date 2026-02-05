import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { GitCheckpointService } from './git-checkpoint.service';

/**
 * DTO for recording git checkpoint
 */
class RecordCheckpointDto {
  sessionId: string;
  commitHash: string;
  filesChanged: number;
  messageNumber?: number | null;
  description?: string | null;
}

/**
 * Internal Git Checkpoint Controller
 * HTTP endpoints for container-manager → api-gateway communication
 * NOT exposed to public API (use /api/internal/* routes)
 */
@Controller('api/internal/git-checkpoints')
export class InternalGitCheckpointController {
  constructor(private readonly gitCheckpointService: GitCheckpointService) {}

  /**
   * Record a git checkpoint after auto-commit
   * Called by container-manager after each git commit
   * POST /api/internal/git-checkpoints
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async recordCheckpoint(@Body() dto: RecordCheckpointDto): Promise<{ message: string }> {
    await this.gitCheckpointService.recordCheckpoint({
      sessionId: dto.sessionId,
      commitHash: dto.commitHash,
      filesChanged: dto.filesChanged,
      messageNumber: dto.messageNumber ?? null,
      description: dto.description ?? null,
    });

    return { message: 'Git checkpoint recorded successfully' };
  }
}
