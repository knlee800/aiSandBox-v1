import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ClaudeModule } from './claude/claude.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { AIExecutionModule } from './ai-execution/ai-execution.module';

/**
 * AppModule
 *
 * Root module for AI Service.
 *
 * Stage C2-K: ConfigModule integrated for provider configuration wiring.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HttpModule,
    ClaudeModule,
    ConversationsModule,
    MessagesModule,
    AIExecutionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
