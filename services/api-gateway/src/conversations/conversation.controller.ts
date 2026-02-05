import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ChatMessageService } from '../chat-messages/chat-message.service';
import { SessionService } from '../sessions/session.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Conversation } from '../entities/conversation.entity';
import { ChatMessage } from '../entities/chat-message.entity';

/**
 * ConversationController
 * Public HTTP endpoints for chat history retrieval
 * All endpoints require JWT authentication
 * Routes: /api/sessions/:id/conversation, /api/conversations/* (global prefix 'api' applied in main.ts)
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly chatMessageService: ChatMessageService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Get conversation metadata for a session
   * GET /api/sessions/:id/conversation
   * Returns 404 if session not found or not owned by user
   * @param id - Session UUID
   * @param req - Request object with authenticated user
   * @returns Conversation metadata
   */
  @Get('sessions/:id/conversation')
  @HttpCode(HttpStatus.OK)
  async getConversationBySession(
    @Param('id') id: string,
    @Request() req,
  ): Promise<Conversation | null> {
    const userId = req.user.userId;

    // Validate session ownership
    const session = await this.sessionService.getSessionById(id);
    if (session.userId !== userId) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    // Return conversation (may be null if not created yet)
    return await this.conversationService.getConversationBySession(id);
  }

  /**
   * Get paginated chat messages for a conversation
   * GET /api/conversations/:id/messages?limit=50&offset=0
   * Returns 404 if conversation not found or not owned by user
   * @param id - Conversation UUID
   * @param limit - Maximum number of messages to return (default: 50)
   * @param offset - Number of messages to skip (default: 0)
   * @param req - Request object with authenticated user
   * @returns Array of chat messages in chronological order (oldest → newest)
   */
  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  async getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Request() req,
  ): Promise<ChatMessage[]> {
    const userId = req.user.userId;

    // Get conversation and validate ownership
    const conversation = await this.conversationService.getConversationById(id);

    // Load session to verify ownership
    const session = await this.sessionService.getSessionById(
      conversation.sessionId,
    );

    if (session.userId !== userId) {
      throw new NotFoundException(`Conversation with ID ${id} not found`);
    }

    // Return paginated message history
    const effectiveLimit = limit ? Number(limit) : 50;
    const effectiveOffset = offset ? Number(offset) : 0;

    return await this.chatMessageService.getMessageHistory(
      id,
      effectiveLimit,
      effectiveOffset,
    );
  }
}
