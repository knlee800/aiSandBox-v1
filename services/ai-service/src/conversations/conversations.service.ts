import { Injectable, NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';

@Injectable()
export class ConversationsService {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  async createConversation(sessionId: string, userId: string) {
    const id = this.generateId();

    this.db.prepare(`
      INSERT INTO conversations (
        id, session_id, user_id, messages, current_message_number,
        created_at, updated_at
      )
      VALUES (?, ?, ?, '[]', 0, datetime('now'), datetime('now'))
    `).run(id, sessionId, userId);

    return {
      id,
      sessionId,
      userId,
      messages: [],
      currentMessageNumber: 0,
    };
  }

  async getConversation(sessionId: string) {
    const conversation = this.db
      .prepare('SELECT * FROM conversations WHERE session_id = ?')
      .get(sessionId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      ...conversation,
      messages: JSON.parse(conversation.messages as string || '[]'),
    };
  }

  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ) {
    const conversation = await this.getConversation(sessionId);
    const messages = conversation.messages;
    const messageNumber = conversation.current_message_number + 1;

    const newMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
      messageNumber,
    };

    messages.push(newMessage);

    this.db.prepare(`
      UPDATE conversations
      SET messages = ?,
          current_message_number = ?,
          updated_at = datetime('now')
      WHERE session_id = ?
    `).run(JSON.stringify(messages), messageNumber, sessionId);

    return {
      message: newMessage,
      messageNumber,
    };
  }

  async getMessages(sessionId: string, limit?: number) {
    const conversation = await this.getConversation(sessionId);
    const messages = conversation.messages;

    if (limit) {
      return messages.slice(-limit);
    }

    return messages;
  }

  async clearConversation(sessionId: string) {
    this.db.prepare(`
      UPDATE conversations
      SET messages = '[]',
          current_message_number = 0,
          updated_at = datetime('now')
      WHERE session_id = ?
    `).run(sessionId);

    return { message: 'Conversation cleared successfully' };
  }

  async getTokenUsage(sessionId: string) {
    // Get session token usage
    const sessionUsage = this.db.prepare(`
      SELECT
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost
      FROM token_usage
      WHERE session_id = ?
    `).get(sessionId) as any;

    // Get user ID from session
    const session = this.db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(sessionId) as any;

    if (!session) {
      return {
        sessionUsage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cost: 0,
        },
        monthlyUsage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cost: 0,
        }
      };
    }

    // Get monthly usage for user
    const monthlyUsage = this.db.prepare(`
      SELECT
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost
      FROM token_usage
      WHERE user_id = ?
        AND timestamp >= datetime('now', 'start of month')
    `).get(session.user_id) as any;

    return {
      sessionUsage: {
        input_tokens: sessionUsage.total_input_tokens || 0,
        output_tokens: sessionUsage.total_output_tokens || 0,
        total_tokens: (sessionUsage.total_input_tokens || 0) + (sessionUsage.total_output_tokens || 0),
        cost: sessionUsage.total_cost || 0,
      },
      monthlyUsage: {
        input_tokens: monthlyUsage.total_input_tokens || 0,
        output_tokens: monthlyUsage.total_output_tokens || 0,
        total_tokens: (monthlyUsage.total_input_tokens || 0) + (monthlyUsage.total_output_tokens || 0),
        cost: monthlyUsage.total_cost || 0,
      }
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
