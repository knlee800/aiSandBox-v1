import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConversationRepository } from '../repositories/conversation.repository';
import { Conversation } from '../entities/conversation.entity';

/**
 * ConversationService
 * Business logic for conversation management
 * Uses ConversationRepository for persistence
 * Enforces 1:1 relationship between Session and Conversation
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  /**
   * Create a new conversation for a session
   * Enforces one conversation per session (1:1 relationship)
   * @param sessionId - Session UUID
   * @returns Created conversation
   * @throws ConflictException if conversation already exists for session
   */
  async createConversationForSession(sessionId: string): Promise<Conversation> {
    // Check if conversation already exists for this session
    const existing = await this.conversationRepository.findBySession(sessionId);
    if (existing) {
      throw new ConflictException(
        `Conversation already exists for session ${sessionId}`,
      );
    }

    return await this.conversationRepository.createForSession(sessionId);
  }

  /**
   * Get conversation by ID
   * @param conversationId - Conversation UUID
   * @returns Conversation entity
   * @throws NotFoundException if conversation doesn't exist
   */
  async getConversationById(conversationId: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findById(
      conversationId,
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    return conversation;
  }

  /**
   * Get conversation by session ID
   * Returns the single conversation associated with the session (1:1)
   * @param sessionId - Session UUID
   * @returns Conversation entity or null if not found
   */
  async getConversationBySession(
    sessionId: string,
  ): Promise<Conversation | null> {
    return await this.conversationRepository.findBySession(sessionId);
  }

  /**
   * Get or create conversation for a session
   * Idempotent operation - returns existing or creates new
   * @param sessionId - Session UUID
   * @returns Conversation entity
   */
  async getOrCreateConversation(sessionId: string): Promise<Conversation> {
    const existing = await this.conversationRepository.findBySession(sessionId);
    if (existing) {
      return existing;
    }

    return await this.conversationRepository.createForSession(sessionId);
  }

  /**
   * Increment the message count for a conversation
   * Called after each new message is added
   * @param conversationId - Conversation UUID
   * @returns Number of affected rows
   */
  async incrementMessageCount(
    conversationId: string,
  ): Promise<{ affected: number }> {
    return await this.conversationRepository.incrementMessageCount(
      conversationId,
    );
  }
}
