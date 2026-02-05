import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Session } from '../entities/session.entity';
import { ContainerManagerHttpClient } from '../clients/container-manager-http.client';

/**
 * SessionController
 * Public HTTP endpoints for session lifecycle management
 * All endpoints require JWT authentication
 * Routes: /api/sessions/* (global prefix 'api' applied in main.ts)
 */
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly containerManagerHttpClient: ContainerManagerHttpClient,
  ) {}

  /**
   * Create a new sandbox session for the authenticated user
   * POST /api/sessions
   * Flow: Create session record → Start container → Return session
   * @param req - Request object with authenticated user
   * @returns Created session data
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSession(@Request() req): Promise<Session> {
    const userId = req.user.userId;

    // Create session record in database
    const session = await this.sessionService.createSession(userId);

    // Start container (fail-fast if container-manager is unreachable)
    await this.containerManagerHttpClient.startSession(session.id);

    return session;
  }

  /**
   * List all active sessions belonging to the authenticated user
   * GET /api/sessions
   * @param req - Request object with authenticated user
   * @returns Array of user's active sessions
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listSessions(@Request() req): Promise<Session[]> {
    const userId = req.user.userId;
    return await this.sessionService.getActiveSessionsByUser(userId);
  }

  /**
   * Get details of a specific session
   * GET /api/sessions/:id
   * Returns 404 if session not found or not owned by user
   * @param id - Session UUID
   * @param req - Request object with authenticated user
   * @returns Session details
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getSession(
    @Param('id') id: string,
    @Request() req,
  ): Promise<Session> {
    const userId = req.user.userId;
    const session = await this.sessionService.getSessionById(id);

    // Validate ownership - return 404 to avoid leaking session existence
    if (session.userId !== userId) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    return session;
  }

  /**
   * Stop a session owned by the authenticated user
   * POST /api/sessions/:id/stop
   * Returns 404 if session not found or not owned by user
   * Flow: Stop container → Update DB status
   * @param id - Session UUID
   * @param req - Request object with authenticated user
   * @returns Success message
   */
  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  async stopSession(
    @Param('id') id: string,
    @Request() req,
  ): Promise<{ message: string }> {
    const userId = req.user.userId;
    const session = await this.sessionService.getSessionById(id);

    // Validate ownership - return 404 to avoid leaking session existence
    if (session.userId !== userId) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    // Stop container first (fail-fast if container-manager is unreachable)
    await this.containerManagerHttpClient.stopSession(id);

    // Update database status after successful container shutdown
    await this.sessionService.stopSession(id);

    return { message: 'Session stopped successfully' };
  }
}
