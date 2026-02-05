import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';
import { AddMessageBySessionDto } from './dto/add-message-by-session.dto';

/**
 * ChatMessageController
 * HTTP endpoints for chat message persistence
 * Primary consumer: ai-service
 * Routes: /api/chat-messages/* (global prefix 'api' applied in main.ts)
 */
@Controller('chat-messages')
export class ChatMessageController {
  constructor(private readonly chatMessageService: ChatMessageService) {}

  /**
   * Add a message to a conversation by session ID
   * POST /api/chat-messages/add-by-session
   * Used by ai-service to persist user and assistant messages
   * @param dto - Message data with session ID
   * @returns Object with message ID
   */
  @Post('add-by-session')
  @HttpCode(HttpStatus.CREATED)
  async addMessageBySession(
    @Body() dto: AddMessageBySessionDto,
  ): Promise<{ id: string }> {
    const message = await this.chatMessageService.addMessageBySession({
      sessionId: dto.sessionId,
      role: dto.role,
      content: dto.content,
      tokensUsed: dto.tokensUsed,
    });

    return { id: message.id };
  }
}
