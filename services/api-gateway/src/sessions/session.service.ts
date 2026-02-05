import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionRepository } from '../repositories/session.repository';
import { Session } from '../entities/session.entity';
import { SessionStatus } from '../entities/session-status.enum';

/**
 * SessionService
 * Business logic for session management
 * Uses SessionRepository for persistence
 */
@Injectable()
export class SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  /**
   * Create a new sandbox session for a user
   * @param userId - User ID who owns the session
   * @param expirationMinutes - Session lifetime in minutes (default: 60)
   * @returns Created session
   */
  async createSession(
    userId: string,
    expirationMinutes: number = 60,
  ): Promise<Session> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    return await this.sessionRepository.createSession(userId, expiresAt);
  }

  /**
   * Get session by ID
   * @param sessionId - Session UUID
   * @returns Session entity
   * @throws NotFoundException if session doesn't exist
   */
  async getSessionById(sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    return session;
  }

  /**
   * Get all active sessions for a user
   * @param userId - User UUID
   * @returns Array of active sessions
   */
  async getActiveSessionsByUser(userId: string): Promise<Session[]> {
    return await this.sessionRepository.findActiveByUser(userId);
  }

  /**
   * Update session status
   * @param sessionId - Session UUID
   * @param status - New status
   * @returns Number of affected rows
   */
  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<{ affected: number }> {
    return await this.sessionRepository.updateStatus(sessionId, status);
  }

  /**
   * Update session last activity timestamp
   * Called on each user interaction to track activity
   * @param sessionId - Session UUID
   * @returns Number of affected rows
   */
  async touchSessionActivity(sessionId: string): Promise<{ affected: number }> {
    return await this.sessionRepository.touchLastActivity(sessionId);
  }

  /**
   * Start a session (change from PENDING to ACTIVE)
   * @param sessionId - Session UUID
   */
  async startSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, SessionStatus.ACTIVE);
  }

  /**
   * Stop a session (change to STOPPED)
   * @param sessionId - Session UUID
   */
  async stopSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, SessionStatus.STOPPED);
  }

  /**
   * Mark session as expired
   * @param sessionId - Session UUID
   */
  async expireSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, SessionStatus.EXPIRED);
  }

  /**
   * Mark session as error state
   * @param sessionId - Session UUID
   */
  async markSessionError(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, SessionStatus.ERROR);
  }
}
