import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageRepository } from '../repositories/chat-message.repository';
import { ConversationService } from '../conversations/conversation.service';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatMessageRole } from '../entities/chat-message-role.enum';

/**
 * ChatMessageService
 * Business logic for chat message management
 * Uses ChatMessageRepository for persistence
 * Integrates with ConversationService for conversation management
 */
@Injectable()
export class ChatMessageService {
  constructor(
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Add a new message to a conversation
   * Ensures conversation exists, persists message, and increments message count
   * @param data - Message data
   * @param data.conversationId - Conversation UUID
   * @param data.role - Message role (user, assistant, system)
   * @param data.content - Message text content
   * @param data.tokensUsed - Token count for billing (optional)
   * @returns Created message
   * @throws NotFoundException if conversation doesn't exist
   */
  async addMessage(data: {
    conversationId: string;
    role: ChatMessageRole;
    content: string;
    tokensUsed?: number;
  }): Promise<ChatMessage> {
    // Ensure conversation exists before adding message
    const conversation = await this.conversationService.getConversationById(
      data.conversationId,
    );

    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${data.conversationId} not found`,
      );
    }

    // Persist the message
    const message = await this.chatMessageRepository.createMessage({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      tokensUsed: data.tokensUsed,
    });

    // Increment conversation message count
    await this.conversationService.incrementMessageCount(data.conversationId);

    return message;
  }

  /**
   * Add a message to a conversation by session ID
   * Convenience method that gets or creates conversation first
   * @param data - Message data
   * @param data.sessionId - Session UUID
   * @param data.role - Message role
   * @param data.content - Message content
   * @param data.tokensUsed - Token count (optional)
   * @returns Created message
   */
  async addMessageBySession(data: {
    sessionId: string;
    role: ChatMessageRole;
    content: string;
    tokensUsed?: number;
  }): Promise<ChatMessage> {
    // Get or create conversation for session
    const conversation = await this.conversationService.getOrCreateConversation(
      data.sessionId,
    );

    // Add message to conversation
    return await this.addMessage({
      conversationId: conversation.id,
      role: data.role,
      content: data.content,
      tokensUsed: data.tokensUsed,
    });
  }

  /**
   * Get message history for a conversation (paginated)
   * Messages are ordered chronologically (oldest first)
   * @param conversationId - Conversation UUID
   * @param limit - Maximum number of messages to return
   * @param offset - Number of messages to skip
   * @returns Array of messages in chronological order
   */
  async getMessageHistory(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ChatMessage[]> {
    // Validate conversation exists
    await this.conversationService.getConversationById(conversationId);

    return await this.chatMessageRepository.findByConversation(
      conversationId,
      limit,
      offset,
    );
  }

  /**
   * Get latest message in a conversation
   * @param conversationId - Conversation UUID
   * @returns Latest message or null if conversation has no messages
   */
  async getLatestMessage(
    conversationId: string,
  ): Promise<ChatMessage | null> {
    return await this.chatMessageRepository.findLatestByConversation(
      conversationId,
    );
  }

  /**
   * Get message history for a session (via conversation)
   * @param sessionId - Session UUID
   * @param limit - Maximum number of messages
   * @param offset - Number of messages to skip
   * @returns Array of messages or empty array if no conversation exists
   */
  async getMessageHistoryBySession(
    sessionId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ChatMessage[]> {
    const conversation = await this.conversationService.getConversationBySession(
      sessionId,
    );

    if (!conversation) {
      return [];
    }

    return await this.chatMessageRepository.findByConversation(
      conversation.id,
      limit,
      offset,
    );
  }
}
