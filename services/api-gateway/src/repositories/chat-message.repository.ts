import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatMessageRole } from '../entities/chat-message-role.enum';

/**
 * ChatMessageRepository
 * Data access layer for ChatMessage entity
 * Handles message persistence and retrieval within conversations
 */
@Injectable()
export class ChatMessageRepository {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly repository: Repository<ChatMessage>,
  ) {}

  /**
   * Create a new message in a conversation
   * @param data - Message creation data
   * @param data.conversationId - Parent conversation UUID
   * @param data.role - Message role (user, assistant, system)
   * @param data.content - Message text content
   * @param data.tokensUsed - Token count for billing (optional, defaults to 0)
   * @returns Created message entity
   */
  async createMessage(data: {
    conversationId: string;
    role: ChatMessageRole;
    content: string;
    tokensUsed?: number;
  }): Promise<ChatMessage> {
    const message = this.repository.create({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      tokensUsed: data.tokensUsed ?? 0,
    });

    return await this.repository.save(message);
  }

  /**
   * Find messages in a conversation with pagination
   * Messages are ordered chronologically (oldest first) for chat history display
   * @param conversationId - Conversation UUID
   * @param limit - Maximum number of messages to return
   * @param offset - Number of messages to skip (for pagination)
   * @returns Array of message entities in chronological order
   */
  async findByConversation(
    conversationId: string,
    limit: number,
    offset: number,
  ): Promise<ChatMessage[]> {
    return await this.repository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find the most recent message in a conversation
   * Useful for context building and last-message tracking
   * @param conversationId - Conversation UUID
   * @returns Latest message entity or null if conversation has no messages
   */
  async findLatestByConversation(
    conversationId: string,
  ): Promise<ChatMessage | null> {
    return await this.repository.findOne({
      where: { conversationId },
      order: { createdAt: 'DESC' },
    });
  }
}
