import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';

/**
 * UsageAggregationService (Task 9.3B)
 * Read-only aggregation of token usage, governance events, and session terminations
 * for future quota enforcement and billing integration
 *
 * CRITICAL CONSTRAINTS:
 * - All queries are READ-ONLY (no writes)
 * - No enforcement logic (aggregation only)
 * - No billing integration (data exposure only)
 * - Parameterized queries using indexed columns
 * - Throws on query failure (no silent failures)
 */
@Injectable()
export class UsageAggregationService {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  /**
   * Aggregate token usage by session
   * Task 9.3B: Read-only aggregation for billing/quota
   *
   * @param sessionId - Session UUID
   * @returns Token usage summary for the session
   */
  aggregateTokenUsageBySession(sessionId: string): {
    sessionId: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    recordCount: number;
  } {
    const result = this.db
      .prepare(
        `SELECT
          session_id,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as record_count
        FROM token_usage
        WHERE session_id = ?
        GROUP BY session_id`,
      )
      .get(sessionId) as
      | {
          session_id: string;
          total_input_tokens: number;
          total_output_tokens: number;
          total_cost_usd: number;
          record_count: number;
        }
      | undefined;

    if (!result) {
      return {
        sessionId,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        recordCount: 0,
      };
    }

    return {
      sessionId: result.session_id,
      totalInputTokens: result.total_input_tokens,
      totalOutputTokens: result.total_output_tokens,
      totalCostUsd: result.total_cost_usd,
      recordCount: result.record_count,
    };
  }

  /**
   * Aggregate token usage by user with optional date range
   * Task 9.3B: Read-only aggregation for billing/quota
   *
   * @param userId - User UUID
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Token usage summary for the user
   */
  aggregateTokenUsageByUser(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): {
    userId: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    recordCount: number;
    dateRange: { start: string | null; end: string | null };
  } {
    let query = `
      SELECT
        user_id,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COUNT(*) as record_count
      FROM token_usage
      WHERE user_id = ?
    `;

    const params: any[] = [userId];

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY user_id';

    const result = this.db.prepare(query).get(...params) as
      | {
          user_id: string;
          total_input_tokens: number;
          total_output_tokens: number;
          total_cost_usd: number;
          record_count: number;
        }
      | undefined;

    if (!result) {
      return {
        userId,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        recordCount: 0,
        dateRange: { start: startDate || null, end: endDate || null },
      };
    }

    return {
      userId: result.user_id,
      totalInputTokens: result.total_input_tokens,
      totalOutputTokens: result.total_output_tokens,
      totalCostUsd: result.total_cost_usd,
      recordCount: result.record_count,
      dateRange: { start: startDate || null, end: endDate || null },
    };
  }

  /**
   * Aggregate token usage by AI provider for a user
   * Task 9.3B: Read-only aggregation for billing/quota
   *
   * @param userId - User UUID
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Token usage breakdown by provider
   */
  aggregateTokenUsageByProvider(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Array<{
    provider: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    recordCount: number;
  }> {
    let query = `
      SELECT
        ai_provider as provider,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COUNT(*) as record_count
      FROM token_usage
      WHERE user_id = ?
    `;

    const params: any[] = [userId];

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY ai_provider ORDER BY total_cost_usd DESC';

    const results = this.db.prepare(query).all(...params) as Array<{
      provider: string;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
      record_count: number;
    }>;

    return results.map((r) => ({
      provider: r.provider,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCostUsd: r.total_cost_usd,
      recordCount: r.record_count,
    }));
  }

  /**
   * Get governance event counts by termination reason
   * Task 9.3B: Read-only aggregation for observability
   *
   * @param userId - Optional user UUID filter
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Breakdown of termination events by reason
   */
  aggregateGovernanceEventsByReason(
    userId?: string,
    startDate?: string,
    endDate?: string,
  ): Array<{
    terminationReason: string;
    count: number;
  }> {
    let query = `
      SELECT
        termination_reason,
        COUNT(*) as count
      FROM governance_events
      WHERE 1=1
    `;

    const params: any[] = [];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (startDate) {
      query += ' AND terminated_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND terminated_at <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY termination_reason ORDER BY count DESC';

    const results = this.db.prepare(query).all(...params) as Array<{
      termination_reason: string;
      count: number;
    }>;

    return results.map((r) => ({
      terminationReason: r.termination_reason,
      count: r.count,
    }));
  }

  /**
   * Get governance event counts by user
   * Task 9.3B: Read-only aggregation for user-level observability
   *
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Breakdown of termination events by user
   */
  aggregateGovernanceEventsByUser(
    startDate?: string,
    endDate?: string,
  ): Array<{
    userId: string | null;
    count: number;
  }> {
    let query = `
      SELECT
        user_id,
        COUNT(*) as count
      FROM governance_events
      WHERE 1=1
    `;

    const params: any[] = [];

    if (startDate) {
      query += ' AND terminated_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND terminated_at <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY user_id ORDER BY count DESC';

    const results = this.db.prepare(query).all(...params) as Array<{
      user_id: string | null;
      count: number;
    }>;

    return results.map((r) => ({
      userId: r.user_id,
      count: r.count,
    }));
  }

  /**
   * Get session termination summary from sessions table
   * Task 9.3B: Read-only aggregation for session lifecycle observability
   *
   * @param userId - Optional user UUID filter
   * @returns Summary of active vs terminated sessions
   */
  aggregateSessionTerminations(userId?: string): {
    totalSessions: number;
    activeSessions: number;
    terminatedSessions: number;
    terminationBreakdown: Array<{
      reason: string;
      count: number;
    }>;
  } {
    let totalQuery = 'SELECT COUNT(*) as count FROM sessions WHERE 1=1';
    let activeQuery =
      'SELECT COUNT(*) as count FROM sessions WHERE terminated_at IS NULL';
    let terminatedQuery =
      'SELECT COUNT(*) as count FROM sessions WHERE terminated_at IS NOT NULL';
    let breakdownQuery = `
      SELECT
        termination_reason as reason,
        COUNT(*) as count
      FROM sessions
      WHERE terminated_at IS NOT NULL
    `;

    const params: any[] = [];

    if (userId) {
      totalQuery += ' AND user_id = ?';
      activeQuery += ' AND user_id = ?';
      terminatedQuery += ' AND user_id = ?';
      breakdownQuery += ' AND user_id = ?';
      params.push(userId);
    }

    breakdownQuery += ' GROUP BY termination_reason ORDER BY count DESC';

    const totalResult = this.db.prepare(totalQuery).get(...params) as {
      count: number;
    };
    const activeResult = this.db.prepare(activeQuery).get(...params) as {
      count: number;
    };
    const terminatedResult = this.db.prepare(terminatedQuery).get(...params) as {
      count: number;
    };
    const breakdownResults = this.db.prepare(breakdownQuery).all(...params) as Array<{
      reason: string;
      count: number;
    }>;

    return {
      totalSessions: totalResult.count,
      activeSessions: activeResult.count,
      terminatedSessions: terminatedResult.count,
      terminationBreakdown: breakdownResults,
    };
  }

  /**
   * Get comprehensive usage summary for a user
   * Task 9.3B: Combined read-only aggregation for billing/quota dashboard
   *
   * @param userId - User UUID
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Comprehensive usage summary
   */
  getUserUsageSummary(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): {
    userId: string;
    dateRange: { start: string | null; end: string | null };
    tokenUsage: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
      recordCount: number;
    };
    providerBreakdown: Array<{
      provider: string;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
      recordCount: number;
    }>;
    governanceEvents: {
      totalEvents: number;
      byReason: Array<{
        terminationReason: string;
        count: number;
      }>;
    };
    sessions: {
      totalSessions: number;
      activeSessions: number;
      terminatedSessions: number;
      terminationBreakdown: Array<{
        reason: string;
        count: number;
      }>;
    };
  } {
    const tokenUsage = this.aggregateTokenUsageByUser(userId, startDate, endDate);
    const providerBreakdown = this.aggregateTokenUsageByProvider(
      userId,
      startDate,
      endDate,
    );
    const governanceEventsByReason = this.aggregateGovernanceEventsByReason(
      userId,
      startDate,
      endDate,
    );
    const sessionSummary = this.aggregateSessionTerminations(userId);

    const totalGovernanceEvents = governanceEventsByReason.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    return {
      userId,
      dateRange: { start: startDate || null, end: endDate || null },
      tokenUsage: {
        totalInputTokens: tokenUsage.totalInputTokens,
        totalOutputTokens: tokenUsage.totalOutputTokens,
        totalCostUsd: tokenUsage.totalCostUsd,
        recordCount: tokenUsage.recordCount,
      },
      providerBreakdown,
      governanceEvents: {
        totalEvents: totalGovernanceEvents,
        byReason: governanceEventsByReason,
      },
      sessions: sessionSummary,
    };
  }
}
