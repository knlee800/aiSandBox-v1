import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * ApiGatewayHttpClient
 * HTTP client for persisting data to api-gateway
 * Communicates via HTTP POST requests (microservices architecture)
 *
 * Design:
 * - NO imports from api-gateway
 * - Fail-fast: throws on error
 * - No retries, no fallback storage
 * - Pure HTTP communication
 * - Authenticates internal API calls with X-Internal-Service-Key (Task 5.2B)
 */
@Injectable()
export class ApiGatewayHttpClient {
  private readonly apiGatewayUrl: string;
  private readonly internalServiceKey: string;

  constructor(private readonly httpService: HttpService) {
    this.apiGatewayUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';

    // Task 5.2B: Internal Service Authentication (client-side)
    // Fail fast if INTERNAL_SERVICE_KEY is not configured
    this.internalServiceKey = process.env.INTERNAL_SERVICE_KEY;
    if (!this.internalServiceKey) {
      throw new Error(
        'INTERNAL_SERVICE_KEY environment variable is required for internal API authentication',
      );
    }
  }

  /**
   * Add a chat message (user or assistant)
   * @param sessionId - Session UUID
   * @param role - Message role (user, assistant, system)
   * @param content - Message content
   * @param tokensUsed - Token count (0 for user messages)
   * @returns Message ID from api-gateway
   * @throws Error if HTTP request fails
   */
  async addChatMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    tokensUsed: number = 0,
  ): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiGatewayUrl}/api/chat-messages/add-by-session`,
        {
          sessionId,
          role,
          content,
          tokensUsed,
        },
        {
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      ),
    );

    return response.data.id;
  }

  /**
   * Record token usage for an AI interaction
   * @param sessionId - Session UUID
   * @param inputTokens - Input tokens consumed
   * @param outputTokens - Output tokens generated
   * @param chatMessageId - Optional chat message ID
   * @param model - AI model identifier
   * @throws Error if HTTP request fails
   */
  async recordTokenUsage(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    chatMessageId?: string,
    model: string = 'claude-sonnet-4-20250514',
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.apiGatewayUrl}/api/token-usage/record`,
        {
          sessionId,
          chatMessageId: chatMessageId || null,
          model,
          inputTokens,
          outputTokens,
        },
        {
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      ),
    );
  }

  /**
   * Get total token usage for a session
   * Read-only endpoint for quota checking (Task 5.1A)
   * @param sessionId - Session UUID
   * @returns Total tokens consumed by the session
   * @throws Error if HTTP request fails
   */
  async getTotalTokenUsage(sessionId: string): Promise<number> {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.apiGatewayUrl}/api/internal/token-usage/sessions/${sessionId}/total`,
        {
          headers: {
            'X-Internal-Service-Key': this.internalServiceKey,
          },
        },
      ),
    );

    return response.data.totalTokens;
  }
}
