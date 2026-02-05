import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatMessageRepository } from '../repositories/chat-message.repository';
import { ChatMessageService } from './chat-message.service';
import { ChatMessageController } from './chat-message.controller';
import { ConversationModule } from '../conversations/conversation.module';

/**
 * ChatMessageModule
 * Manages chat message persistence and retrieval
 * Depends on ConversationModule for conversation management
 * Exposes HTTP endpoints for ai-service integration
 */
@Module({
  imports: [
    // Register ChatMessage entity for TypeORM
    TypeOrmModule.forFeature([ChatMessage]),
    // Import ConversationModule for ConversationService
    forwardRef(() => ConversationModule),
  ],
  controllers: [ChatMessageController],
  providers: [ChatMessageRepository, ChatMessageService],
  exports: [ChatMessageService, ChatMessageRepository],
})
export class ChatMessageModule {}
