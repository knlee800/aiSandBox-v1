import { Controller, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * Internal Session Controller
 * HTTP endpoints for container-manager → api-gateway communication
 * NOT exposed to public API (use /api/internal/* routes)
 */
@Controller('api/internal/sessions')
export class InternalSessionController {
  constructor(private readonly sessionService: SessionService) {}

  /**
   * Start a session (PENDING → ACTIVE)
   * Called by container-manager when session starts
   * POST /api/internal/sessions/:sessionId/start
   */
  @Post(':sessionId/start')
  @HttpCode(HttpStatus.OK)
  async startSession(@Param('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.sessionService.startSession(sessionId);
    return { message: 'Session started successfully' };
  }

  /**
   * Stop a session (ACTIVE → STOPPED)
   * Called by container-manager when session stops
   * POST /api/internal/sessions/:sessionId/stop
   */
  @Post(':sessionId/stop')
  @HttpCode(HttpStatus.OK)
  async stopSession(@Param('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.sessionService.stopSession(sessionId);
    return { message: 'Session stopped successfully' };
  }

  /**
   * Mark session as error (ANY → ERROR)
   * Called by container-manager when session encounters an error
   * POST /api/internal/sessions/:sessionId/error
   */
  @Post(':sessionId/error')
  @HttpCode(HttpStatus.OK)
  async markSessionError(@Param('sessionId') sessionId: string): Promise<{ message: string }> {
    await this.sessionService.markSessionError(sessionId);
    return { message: 'Session marked as error' };
  }
}
