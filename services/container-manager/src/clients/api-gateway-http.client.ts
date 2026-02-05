import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * HTTP client for container-manager → api-gateway communication
 * ZERO imports from api-gateway (HTTP-only)
 * Fail fast on errors (no retries)
 * Authenticates internal API calls with X-Internal-Service-Key (Task 5.2B)
 */
@Injectable()
export class ApiGatewayHttpClient {
  private readonly logger = new Logger(ApiGatewayHttpClient.name);
  private readonly baseUrl: string;
  private readonly internalServiceKey: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';

    // Task 5.2B: Internal Service Authentication (client-side)
    // Fail fast if INTERNAL_SERVICE_KEY is not configured
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY;
    if (!this.internalServiceKey) {
      throw new Error(
        'INTERNAL_SERVICE_KEY environment variable is required for internal API authentication',
      );
    }
  }

  /**
   * Notify api-gateway that a session has started
   * Called when container-manager activates a session
   * @param sessionId - Session UUID
   */
  async notifySessionStarted(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/internal/sessions/${sessionId}/start`,
          {},
          {
            headers: {
              'X-Internal-Service-Key': this.internalServiceKey,
            },
          },
        ),
      );
      this.logger.log(`Session started: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to notify session start for ${sessionId}: ${error.message}`);
      throw error; // Fail fast
    }
  }

  /**
   * Notify api-gateway that a session has stopped
   * Called when container-manager stops a session
   * @param sessionId - Session UUID
   */
  async notifySessionStopped(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/internal/sessions/${sessionId}/stop`,
          {},
          {
            headers: {
              'X-Internal-Service-Key': this.internalServiceKey,
            },
          },
        ),
      );
      this.logger.log(`Session stopped: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to notify session stop for ${sessionId}: ${error.message}`);
      throw error; // Fail fast
    }
  }

  /**
   * Notify api-gateway that a session encountered an error
   * Called when container-manager detects a session error
   * @param sessionId - Session UUID
   */
  async notifySessionError(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/internal/sessions/${sessionId}/error`,
          {},
          {
            headers: {
              'X-Internal-Service-Key': this.internalServiceKey,
            },
          },
        ),
      );
      this.logger.log(`Session error: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to notify session error for ${sessionId}: ${error.message}`);
      throw error; // Fail fast
    }
  }

  /**
   * Record a git checkpoint in api-gateway after auto-commit
   * Called by container-manager git service after each commit
   * @param data - Checkpoint data
   */
  async recordGitCheckpoint(data: {
    sessionId: string;
    commitHash: string;
    filesChanged: number;
    messageNumber?: number;
    description?: string;
  }): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/internal/git-checkpoints`,
          {
            sessionId: data.sessionId,
            commitHash: data.commitHash,
            filesChanged: data.filesChanged,
            messageNumber: data.messageNumber || null,
            description: data.description || null,
          },
          {
            headers: {
              'X-Internal-Service-Key': this.internalServiceKey,
            },
          },
        ),
      );
      this.logger.log(`Git checkpoint recorded: ${data.commitHash} (session: ${data.sessionId})`);
    } catch (error) {
      this.logger.error(
        `Failed to record git checkpoint for ${data.sessionId}: ${error.message}`,
      );
      throw error; // Fail fast
    }
  }
}
