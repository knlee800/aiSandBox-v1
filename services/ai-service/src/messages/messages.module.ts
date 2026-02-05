import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ClaudeModule } from '../claude/claude.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { QuotaModule } from '../quota/quota.module';
import { ApiGatewayHttpClient } from '../clients/api-gateway-http.client';

@Module({
  imports: [
    HttpModule,
    ClaudeModule,
    ConversationsModule,
    QuotaModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, ApiGatewayHttpClient],
  exports: [MessagesService],
})
export class MessagesModule {}
