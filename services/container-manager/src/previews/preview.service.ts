import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { DockerRuntimeService } from '../docker/docker-runtime.service';

/**
 * PreviewService (Phase 7.3)
 * Task 7.3A: Preview Port Registration (Internal Only)
 *
 * Manages preview port registrations for session containers.
 * Stores port mappings in memory only (no database persistence).
 */
@Injectable()
export class PreviewService {
  // In-memory store: sessionId -> port
  private portRegistry: Map<string, number> = new Map();

  constructor(
    private sessionsService: SessionsService,
    private dockerRuntimeService: DockerRuntimeService,
  ) {}

  /**
   * Register a preview port for a session container
   * Task 8.4A: Enforce Session Termination (HTTP 410)
   * Task 9.5A: Enforce Quota Limits (HTTP 429)
   *
   * Validations:
   * - Session must not be terminated (410 if terminated)
   * - Quota must not be exceeded (429 if exceeded)
   * - Port must be between 1024 and 65535
   * - Session must exist
   * - Container must be running
   *
   * @param sessionId - The session ID
   * @param port - The container port to expose (1024-65535)
   * @returns Registration confirmation
   * @throws NotFoundException if session does not exist
   * @throws GoneException if session is terminated
   * @throws TooManyRequestsException if quota exceeded
   * @throws BadRequestException if port is invalid
   * @throws InternalServerErrorException if container validation fails
   */
  async registerPreviewPort(
    sessionId: string,
    port: number,
  ): Promise<{ sessionId: string; port: number; registered: true }> {
    // Task 8.4A: Check session termination FIRST (DB-backed via SessionsService)
    this.sessionsService.assertSessionUsable(sessionId);

    // Task 9.5A: Check quota limits SECOND (request-time blocking)
    await this.sessionsService.checkQuota(sessionId);

    // Validate port range
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new BadRequestException(
        'Port must be an integer between 1024 and 65535',
      );
    }

    // Validate session exists and container is running
    await this.validateSessionContainer(sessionId);

    // Register port in memory
    this.portRegistry.set(sessionId, port);

    return {
      sessionId,
      port,
      registered: true,
    };
  }

  /**
   * Get registered port for a session
   *
   * @param sessionId - The session ID
   * @returns The registered port, or null if not registered
   */
  getRegisteredPort(sessionId: string): number | null {
    return this.portRegistry.get(sessionId) ?? null;
  }

  /**
   * Unregister a preview port for a session
   *
   * @param sessionId - The session ID
   */
  unregisterPreviewPort(sessionId: string): void {
    this.portRegistry.delete(sessionId);
  }

  /**
   * Validate that session exists and container is running
   *
   * @throws InternalServerErrorException if container not found or not running
   */
  private async validateSessionContainer(sessionId: string): Promise<void> {
    try {
      // Find container by session ID
      const container =
        await this.dockerRuntimeService.findContainerBySessionId(sessionId);

      // Verify container is running
      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        throw new InternalServerErrorException(
          `Container for session ${sessionId} is not running`,
        );
      }
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Container not found or other docker error
      throw new InternalServerErrorException(
        `Failed to validate container for session ${sessionId}: ${error.message}`,
      );
    }
  }
}
