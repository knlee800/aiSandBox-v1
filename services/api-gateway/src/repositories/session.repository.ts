import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../entities/session.entity';
import { SessionStatus } from '../entities/session-status.enum';

/**
 * SessionRepository
 * Data access layer for Session entity
 * Provides clean abstraction over TypeORM operations
 */
@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(Session)
    private readonly repository: Repository<Session>,
  ) {}

  /**
   * Create a new session for a user
   * @param userId - User ID who owns the session
   * @param expiresAt - Expiration timestamp for the session
   * @returns Created session entity
   */
  async createSession(userId: string, expiresAt: Date): Promise<Session> {
    const session = this.repository.create({
      userId,
      expiresAt,
      lastActivityAt: new Date(),
      status: SessionStatus.PENDING,
    });

    return await this.repository.save(session);
  }

  /**
   * Find a session by its ID
   * @param sessionId - Session UUID
   * @returns Session entity or null if not found
   */
  async findById(sessionId: string): Promise<Session | null> {
    return await this.repository.findOne({
      where: { id: sessionId },
    });
  }

  /**
   * Find all active sessions for a user
   * Active means status is ACTIVE or PENDING (not stopped, expired, or error)
   * @param userId - User UUID
   * @returns Array of active session entities
   */
  async findActiveByUser(userId: string): Promise<Session[]> {
    return await this.repository.find({
      where: [
        { userId, status: SessionStatus.ACTIVE },
        { userId, status: SessionStatus.PENDING },
      ],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Update the status of a session
   * @param sessionId - Session UUID
   * @param status - New session status
   * @returns Update result with affected rows count
   */
  async updateStatus(
    sessionId: string,
    status: SessionStatus,
  ): Promise<{ affected: number }> {
    const result = await this.repository.update(
      { id: sessionId },
      { status },
    );

    return { affected: result.affected || 0 };
  }

  /**
   * Update the last activity timestamp for a session
   * Called on each user interaction to track session activity
   * @param sessionId - Session UUID
   * @returns Update result with affected rows count
   */
  async touchLastActivity(sessionId: string): Promise<{ affected: number }> {
    const result = await this.repository.update(
      { id: sessionId },
      { lastActivityAt: new Date() },
    );

    return { affected: result.affected || 0 };
  }
}
