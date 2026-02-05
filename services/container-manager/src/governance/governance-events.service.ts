import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';

/**
 * GovernanceEventsService (Task 9.3A)
 * Passive logging of governance termination events for observability
 *
 * CRITICAL CONSTRAINTS:
 * - All logging is best-effort (never throws)
 * - Insert failures are logged but do not block execution
 * - No retries, no transaction rollbacks
 * - Does NOT change enforcement logic or request flow
 */
@Injectable()
export class GovernanceEventsService {
  private db: Database.Database;

  constructor() {
    // Connect to database (same DB as SessionsService)
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  /**
   * Log a governance termination event (best-effort)
   * Task 9.3A: Passive logging only, NO enforcement logic
   *
   * @param sessionId - Session UUID
   * @param userId - User UUID (nullable)
   * @param terminationReason - Reason for termination (e.g., "max_lifetime", "idle_timeout")
   * @param terminatedAt - ISO 8601 timestamp
   */
  logTerminationEvent(
    sessionId: string,
    userId: string | null,
    terminationReason: string,
    terminatedAt: string,
  ): void {
    try {
      // Best-effort insert (no retries, no throws)
      this.db
        .prepare(
          `INSERT INTO governance_events (session_id, user_id, termination_reason, terminated_at, source)
           VALUES (?, ?, ?, ?, 'container-manager')`,
        )
        .run(sessionId, userId, terminationReason, terminatedAt);

      // Silent success (no logs to avoid noise)
    } catch (error) {
      // Log error but do NOT throw (best-effort guarantee)
      console.error(
        `[GovernanceEventsService] Failed to log termination event for session ${sessionId}:`,
        error.message,
      );
    }
  }
}
