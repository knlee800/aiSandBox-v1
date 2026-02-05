import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';

/**
 * ConversationRepository
 * Data access layer for Conversation entity
 * Handles chat timeline persistence for sessions
 */
@Injectable()
export class ConversationRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly repository: Repository<Conversation>,
  ) {}

  /**
   * Create a new conversation for a session
   * One session has exactly one conversation (1:1 relationship)
   * @param sessionId - Session UUID
   * @returns Created conversation entity
   */
  async createForSession(sessionId: string): Promise<Conversation> {
    const conversation = this.repository.create({
      sessionId,
      messagesCount: 0,
    });

    return await this.repository.save(conversation);
  }

  /**
   * Find a conversation by its ID
   * @param conversationId - Conversation UUID
   * @returns Conversation entity or null if not found
   */
  async findById(conversationId: string): Promise<Conversation | null> {
    return await this.repository.findOne({
      where: { id: conversationId },
    });
  }

  /**
   * Find a conversation by session ID
   * Since Session:Conversation is 1:1, returns single conversation or null
   * @param sessionId - Session UUID
   * @returns Conversation entity or null if not found
   */
  async findBySession(sessionId: string): Promise<Conversation | null> {
    return await this.repository.findOne({
      where: { sessionId },
    });
  }

  /**
   * Increment the message count for a conversation
   * Called each time a new message is added to the conversation
   * Uses atomic increment to avoid race conditions
   * @param conversationId - Conversation UUID
   * @returns Update result with affected rows count
   */
  async incrementMessageCount(
    conversationId: string,
  ): Promise<{ affected: number }> {
    const result = await this.repository.increment(
      { id: conversationId },
      'messagesCount',
      1,
    );

    return { affected: result.affected || 0 };
  }
}
