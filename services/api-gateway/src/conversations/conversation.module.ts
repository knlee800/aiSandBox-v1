import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../entities/conversation.entity';
import { ConversationRepository } from '../repositories/conversation.repository';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { ChatMessageModule } from '../chat-messages/chat-message.module';
import { SessionModule } from '../sessions/session.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation]),
    forwardRef(() => ChatMessageModule),
    forwardRef(() => SessionModule),
  ],
  controllers: [ConversationController],
  providers: [ConversationRepository, ConversationService],
  exports: [ConversationService, ConversationRepository],
})
export class ConversationModule {}
