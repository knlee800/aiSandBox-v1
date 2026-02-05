import { Controller, Get, Post, Delete, Param, Query } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { QuotaService } from '../quota/quota.service';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private conversationsService: ConversationsService,
    private quotaService: QuotaService,
  ) {}

  @Get(':sessionId')
  async get(@Param('sessionId') sessionId: string) {
    return this.conversationsService.getConversation(sessionId);
  }

  @Get(':sessionId/messages')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number
  ) {
    return this.conversationsService.getMessages(
      sessionId,
      limit ? parseInt(limit.toString()) : undefined
    );
  }

  @Delete(':sessionId')
  async clear(@Param('sessionId') sessionId: string) {
    return this.conversationsService.clearConversation(sessionId);
  }

  @Get(':sessionId/usage')
  async getUsage(
    @Param('sessionId') sessionId: string
  ) {
    return this.conversationsService.getTokenUsage(sessionId);
  }

  @Get(':sessionId/quota-status')
  async getQuotaStatus(
    @Param('sessionId') sessionId: string
  ) {
    return this.quotaService.getQuotaStatus(sessionId);
  }

  @Get()
  health() {
    return {
      status: 'ok',
      service: 'conversations',
      timestamp: new Date().toISOString(),
    };
  }
}
