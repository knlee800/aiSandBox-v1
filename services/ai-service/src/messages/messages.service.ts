import { Injectable, BadRequestException } from '@nestjs/common';
import { ClaudeService } from '../claude/claude.service';
import { ConversationsService } from '../conversations/conversations.service';
import { QuotaService } from '../quota/quota.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import Database from 'better-sqlite3';
import * as path from 'path';
import { ApiGatewayHttpClient } from '../clients/api-gateway-http.client';

@Injectable()
export class MessagesService {
  private db: Database.Database;
  private containerManagerUrl = process.env.CONTAINER_MANAGER_URL || 'http://localhost:4001';

  constructor(
    private claudeService: ClaudeService,
    private conversationsService: ConversationsService,
    private quotaService: QuotaService,
    private httpService: HttpService,
    private apiGatewayClient: ApiGatewayHttpClient,
  ) {
    const dbPath = path.join(__dirname, '../../../..', 'database', 'aisandbox.db');
    this.db = new Database(dbPath);
  }

  async handleUserMessage(
    sessionId: string,
    userId: string,
    message: string,
  ) {
    // Verify session exists and belongs to user
    const session = await this.getSession(sessionId, userId);
    if (!session) {
      throw new BadRequestException('Session not found or access denied');
    }

    // Get or create conversation
    let conversation;
    try {
      conversation = await this.conversationsService.getConversation(sessionId);
    } catch (error) {
      // Create new conversation if it doesn't exist
      conversation = await this.conversationsService.createConversation(sessionId, userId);
    }

    // Persist user message via api-gateway HTTP (fail-fast)
    const userMessageId = await this.apiGatewayClient.addChatMessage(
      sessionId,
      'user',
      message,
      0, // User messages have 0 tokens
    );

    // Add user message to local conversation for context building
    await this.conversationsService.addMessage(sessionId, 'user', message);

    // Get conversation history for context
    const messages = await this.conversationsService.getMessages(sessionId, 20);

    // Build system prompt with workspace context
    const systemPrompt = this.buildSystemPrompt(session);

    // Task 5.1B: Check quota BEFORE calling Claude API
    // Throws QuotaExceededException if limit would be exceeded
    await this.quotaService.checkQuota(sessionId);

    // Call Claude API
    const claudeResponse = await this.claudeService.sendMessage(
      messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      systemPrompt,
    );

    // Parse Claude's response for file operations
    const operations = this.parseFileOperations(claudeResponse.content);

    // Execute file operations via Container Manager
    if (operations.length > 0) {
      await this.executeFileOperations(sessionId, operations);
    }

    // Add assistant message to local conversation
    const assistantMessageResult = await this.conversationsService.addMessage(
      sessionId,
      'assistant',
      claudeResponse.content,
    );

    // Persist assistant message via api-gateway HTTP (fail-fast)
    const assistantMessageId = await this.apiGatewayClient.addChatMessage(
      sessionId,
      'assistant',
      claudeResponse.content,
      claudeResponse.usage.output_tokens, // Assistant message token count
    );

    // Create git commit if there were file operations
    if (operations.length > 0) {
      await this.createGitCommit(sessionId, userId, assistantMessageResult.messageNumber);
    }

    // Record token usage via api-gateway HTTP (fail-fast)
    await this.apiGatewayClient.recordTokenUsage(
      sessionId,
      claudeResponse.usage.input_tokens,
      claudeResponse.usage.output_tokens,
      assistantMessageId,
    );

    return {
      message: claudeResponse.content,
      operations: operations,
      usage: claudeResponse.usage,
    };
  }

  async streamUserMessage(
    sessionId: string,
    userId: string,
    message: string,
    onChunk: (text: string) => void,
  ) {
    // Verify session
    const session = await this.getSession(sessionId, userId);
    if (!session) {
      throw new BadRequestException('Session not found or access denied');
    }

    // Get or create conversation
    let conversation;
    try {
      conversation = await this.conversationsService.getConversation(sessionId);
    } catch (error) {
      conversation = await this.conversationsService.createConversation(sessionId, userId);
    }

    // Persist user message via api-gateway (fail-fast)
    const userMessageId = await this.apiGatewayClient.addChatMessage(
      sessionId,
      'user',
      message,
      0,
    );

    // Add user message to local conversation
    await this.conversationsService.addMessage(sessionId, 'user', message);

    // Get history
    const messages = await this.conversationsService.getMessages(sessionId, 20);
    const systemPrompt = this.buildSystemPrompt(session);

    // Task 5.1B: Check quota BEFORE calling Claude API
    // Throws QuotaExceededException if limit would be exceeded
    await this.quotaService.checkQuota(sessionId);

    // Stream Claude response
    const claudeResponse = await this.claudeService.streamMessage(
      messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      systemPrompt,
      onChunk,
    );

    // Parse and execute operations
    const operations = this.parseFileOperations(claudeResponse.content);
    if (operations.length > 0) {
      await this.executeFileOperations(sessionId, operations);
    }

    // Save assistant message locally
    const assistantMessageResult = await this.conversationsService.addMessage(
      sessionId,
      'assistant',
      claudeResponse.content,
    );

    // Persist assistant message via api-gateway (fail-fast)
    const assistantMessageId = await this.apiGatewayClient.addChatMessage(
      sessionId,
      'assistant',
      claudeResponse.content,
      claudeResponse.usage.output_tokens,
    );

    // Create git commit if there were file operations
    if (operations.length > 0) {
      await this.createGitCommit(sessionId, userId, assistantMessageResult.messageNumber);
    }

    // Record token usage via api-gateway HTTP (fail-fast)
    await this.apiGatewayClient.recordTokenUsage(
      sessionId,
      claudeResponse.usage.input_tokens,
      claudeResponse.usage.output_tokens,
      assistantMessageId,
    );

    return {
      message: claudeResponse.content,
      operations: operations,
      usage: claudeResponse.usage,
    };
  }

  private buildSystemPrompt(session: any): string {
    return `You are an AI coding assistant helping users build applications in a sandbox environment.

The user is working in session: ${session.id}
Workspace path: /workspaces/${session.id}
Current status: ${session.status}

You can create, modify, and delete files by using specific markers in your responses:
- To create/update a file, use: FILE_WRITE: <path> | <content>
- To delete a file, use: FILE_DELETE: <path>

Always provide clear explanations of what you're doing and why.
Focus on writing clean, maintainable code with good practices.
`;
  }

  private parseFileOperations(content: string): Array<{
    type: 'write' | 'delete';
    path: string;
    content?: string;
  }> {
    const operations = [];

    // Parse FILE_WRITE operations
    const writeMatches = content.matchAll(/FILE_WRITE:\s*(.+?)\s*\|\s*([\s\S]+?)(?=FILE_WRITE:|FILE_DELETE:|$)/g);
    for (const match of writeMatches) {
      operations.push({
        type: 'write' as const,
        path: match[1].trim(),
        content: match[2].trim(),
      });
    }

    // Parse FILE_DELETE operations
    const deleteMatches = content.matchAll(/FILE_DELETE:\s*(.+?)(?:\n|$)/g);
    for (const match of deleteMatches) {
      operations.push({
        type: 'delete' as const,
        path: match[1].trim(),
      });
    }

    return operations;
  }

  private async executeFileOperations(
    sessionId: string,
    operations: Array<{ type: string; path: string; content?: string }>,
  ) {
    for (const op of operations) {
      try {
        if (op.type === 'write') {
          await firstValueFrom(
            this.httpService.post(
              `${this.containerManagerUrl}/api/files/${sessionId}/write`,
              {
                path: op.path,
                content: op.content,
              },
            ),
          );
        } else if (op.type === 'delete') {
          await firstValueFrom(
            this.httpService.delete(
              `${this.containerManagerUrl}/api/files/${sessionId}/delete?path=${encodeURIComponent(op.path)}`,
            ),
          );
        }
      } catch (error) {
        console.error(`Failed to execute ${op.type} operation for ${op.path}:`, error.message);
      }
    }
  }

  private async getSession(sessionId: string, userId: string) {
    return this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId);
  }

  private async createGitCommit(
    sessionId: string,
    userId: string,
    messageNumber: number,
  ) {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.containerManagerUrl}/api/git/${sessionId}/commit`,
          {
            userId,
            messageNumber,
            description: `Auto-commit: Message ${messageNumber}`,
          },
        ),
      );
      console.log(`Git commit created for session ${sessionId}, message ${messageNumber}`);
    } catch (error) {
      console.error(`Failed to create git commit for session ${sessionId}:`, error.message);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
