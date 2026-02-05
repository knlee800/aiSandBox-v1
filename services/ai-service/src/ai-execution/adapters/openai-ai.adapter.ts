import {
  Injectable,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { AIAdapter } from './ai-adapter.interface';
import { AIExecutionRequest, AIExecutionResult } from '../types';

/**
 * OpenAIAdapter
 *
 * Stage C2-I: OpenAI Adapter Implementation
 *
 * Real AI adapter that integrates with OpenAI's Chat Completions API.
 *
 * Responsibilities:
 * - Transform AIExecutionRequest to OpenAI Chat Completions API format
 * - Execute requests via OpenAI SDK
 * - Transform OpenAI responses to AIExecutionResult
 * - Extract token usage from usage.total_tokens
 * - Throw on all failures (no error payloads)
 *
 * Design Principles:
 * - Implements AIAdapter interface exactly
 * - Stateless (no conversation history management)
 * - Deterministic (same request → same behavior)
 * - Fail-fast (missing API key throws at construction)
 *
 * Token Accounting:
 * - Adapters return token usage via AIExecutionResult
 * - Token recording is performed by AIExecutionService (ADR-12B)
 * - Adapters DO NOT persist, record, or bill tokens
 */
@Injectable()
export class OpenAIAdapter implements AIAdapter {
  private readonly logger = new Logger(OpenAIAdapter.name);
  private readonly client: OpenAI;
  private readonly defaultModel = 'gpt-4o';
  private readonly defaultMaxTokens = 4096;
  private readonly defaultTemperature = 1.0;

  readonly model: string;

  /**
   * Construct OpenAIAdapter
   *
   * @param apiKey - OpenAI API key (required)
   * @param options - Optional configuration
   * @throws Error if API key is missing
   */
  constructor(
    apiKey: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      timeout?: number;
      baseURL?: string;
      organization?: string;
    },
  ) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('OpenAI API key is required');
    }

    this.model = options?.model ?? this.defaultModel;

    this.client = new OpenAI({
      apiKey,
      timeout: options?.timeout,
      baseURL: options?.baseURL,
      organization: options?.organization,
    });

    this.logger.log(`OpenAIAdapter initialized with model: ${this.model}`);
  }

  /**
   * Execute AI request via OpenAI API
   *
   * Transforms AIExecutionRequest to OpenAI format, executes via SDK,
   * and transforms response to AIExecutionResult.
   *
   * @param request - AI execution request
   * @returns AI execution result with output, tokensUsed, and model
   * @throws UnauthorizedException for 401 (invalid API key)
   * @throws BadRequestException for 400 (validation errors)
   * @throws ServiceUnavailableException for network/timeout errors
   * @throws InternalServerErrorException for malformed responses or server errors
   */
  async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
    this.logger.debug(
      `Executing OpenAI request for session=${request.sessionId}, conversation=${request.conversationId}`,
    );

    try {
      // Transform AIExecutionRequest to OpenAI Chat Completions API format
      const openaiRequest: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.model,
        max_tokens: this.defaultMaxTokens,
        temperature: this.defaultTemperature,
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
      };

      // Execute request via OpenAI SDK
      const response = await this.client.chat.completions.create(openaiRequest);

      // Transform response to AIExecutionResult
      return this.transformResponse(response);
    } catch (error) {
      // Transform SDK errors to NestJS exceptions
      this.handleError(error, request);
    }
  }

  /**
   * Transform OpenAI response to AIExecutionResult
   *
   * Extracts:
   * - output: text content from choices[0].message.content
   * - tokensUsed: usage.total_tokens
   * - model: model identifier from response
   *
   * @param response - OpenAI Chat Completions API response
   * @returns AIExecutionResult
   * @throws InternalServerErrorException if response is malformed
   */
  private transformResponse(
    response: OpenAI.Chat.ChatCompletion,
  ): AIExecutionResult {
    // Validate response structure
    if (!response.choices || response.choices.length === 0) {
      this.logger.error('OpenAI response missing choices field');
      throw new InternalServerErrorException(
        'Malformed OpenAI response: missing choices',
      );
    }

    const content = response.choices[0].message.content;
    if (!content || content.trim().length === 0) {
      this.logger.error('OpenAI response missing or empty content');
      throw new InternalServerErrorException(
        'Malformed OpenAI response: missing content',
      );
    }

    if (!response.usage || typeof response.usage.total_tokens !== 'number') {
      this.logger.error('OpenAI response missing usage field');
      throw new InternalServerErrorException(
        'Malformed OpenAI response: missing usage',
      );
    }

    // Validate token counts
    if (response.usage.total_tokens < 0) {
      this.logger.error('Invalid token count in OpenAI response', {
        total_tokens: response.usage.total_tokens,
      });
      throw new InternalServerErrorException(
        'Malformed OpenAI response: invalid token count',
      );
    }

    // Extract values
    const output = content;
    const tokensUsed = response.usage.total_tokens;
    const model = response.model || this.model;

    this.logger.debug(
      `OpenAI response: output=${output.length} chars, tokens=${tokensUsed}, model=${model}`,
    );

    return {
      output,
      tokensUsed,
      model,
    };
  }

  /**
   * Handle SDK errors and transform to NestJS exceptions
   *
   * Error categories:
   * - 401 Unauthorized → UnauthorizedException
   * - 400 Bad Request → BadRequestException
   * - 429 Rate Limit → ServiceUnavailableException
   * - 500 Server Error → InternalServerErrorException
   * - Network/Timeout → ServiceUnavailableException
   * - Unknown → InternalServerErrorException
   *
   * @param error - Error from OpenAI SDK
   * @param request - Original AIExecutionRequest (for context)
   * @throws Never returns, always throws
   */
  private handleError(error: unknown, request: AIExecutionRequest): never {
    // If error is already a NestJS HTTP exception, re-throw it directly
    if (
      error instanceof InternalServerErrorException ||
      error instanceof UnauthorizedException ||
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }

    this.logger.error('OpenAI API error', {
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Handle OpenAI SDK errors (check for status property)
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as any).status;
      const message = (error as any).message || 'Unknown error';

      if (status === 401) {
        throw new UnauthorizedException('Invalid OpenAI API key', message);
      }

      if (status === 400) {
        throw new BadRequestException(
          'Invalid request to OpenAI API',
          message,
        );
      }

      if (status === 429) {
        throw new ServiceUnavailableException(
          'OpenAI API rate limit exceeded',
          message,
        );
      }

      if (status >= 500 && status < 600) {
        throw new InternalServerErrorException(
          'OpenAI API server error',
          message,
        );
      }

      // Other API errors
      throw new InternalServerErrorException('OpenAI API error', message);
    }

    // Handle network/timeout errors
    if (error instanceof Error) {
      if (
        error.name === 'TimeoutError' ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT')
      ) {
        throw new ServiceUnavailableException(
          'OpenAI API timeout',
          error.message,
        );
      }

      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      ) {
        throw new ServiceUnavailableException(
          'OpenAI API connection error',
          error.message,
        );
      }
    }

    // Unknown error
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new InternalServerErrorException(
      'Unexpected error during OpenAI API call',
      errorMessage,
    );
  }
}
