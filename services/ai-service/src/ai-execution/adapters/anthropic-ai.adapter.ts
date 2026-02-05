import {
  Injectable,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AIAdapter } from './ai-adapter.interface';
import { AIExecutionRequest, AIExecutionResult } from '../types';

/**
 * AnthropicAdapter
 *
 * Stage C2-H: Anthropic Claude Adapter Implementation
 *
 * Real AI adapter that integrates with Anthropic's Claude API.
 *
 * Responsibilities:
 * - Transform AIExecutionRequest to Anthropic Messages API format
 * - Execute requests via Anthropic SDK
 * - Transform Anthropic responses to AIExecutionResult
 * - Extract token usage (input_tokens + output_tokens)
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
export class AnthropicAdapter implements AIAdapter {
  private readonly logger = new Logger(AnthropicAdapter.name);
  private readonly client: Anthropic;
  private readonly defaultModel = 'claude-3-5-sonnet-20241022';
  private readonly defaultMaxTokens = 4096;
  private readonly defaultTemperature = 1.0;

  readonly model: string;

  /**
   * Construct AnthropicAdapter
   *
   * @param apiKey - Anthropic API key (required)
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
    },
  ) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('Anthropic API key is required');
    }

    this.model = options?.model ?? this.defaultModel;

    this.client = new Anthropic({
      apiKey,
      timeout: options?.timeout,
      baseURL: options?.baseURL,
    });

    this.logger.log(`AnthropicAdapter initialized with model: ${this.model}`);
  }

  /**
   * Execute AI request via Anthropic API
   *
   * Transforms AIExecutionRequest to Anthropic format, executes via SDK,
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
      `Executing Anthropic request for session=${request.sessionId}, conversation=${request.conversationId}`,
    );

    try {
      // Transform AIExecutionRequest to Anthropic Messages API format
      const anthropicRequest: Anthropic.MessageCreateParams = {
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

      // Execute request via Anthropic SDK
      const response = await this.client.messages.create(anthropicRequest);

      // Transform response to AIExecutionResult
      return this.transformResponse(response);
    } catch (error) {
      // Transform SDK errors to NestJS exceptions
      this.handleError(error, request);
    }
  }

  /**
   * Transform Anthropic response to AIExecutionResult
   *
   * Extracts:
   * - output: text content from first text block
   * - tokensUsed: sum of input_tokens + output_tokens
   * - model: model identifier from response
   *
   * @param response - Anthropic Messages API response
   * @returns AIExecutionResult
   * @throws InternalServerErrorException if response is malformed
   */
  private transformResponse(
    response: Anthropic.Message,
  ): AIExecutionResult {
    // Validate response structure
    if (!response.content || response.content.length === 0) {
      this.logger.error('Anthropic response missing content field');
      throw new InternalServerErrorException(
        'Malformed Anthropic response: missing content',
      );
    }

    if (!response.usage) {
      this.logger.error('Anthropic response missing usage field');
      throw new InternalServerErrorException(
        'Malformed Anthropic response: missing usage',
      );
    }

    // Extract text content from content blocks
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text);

    if (textBlocks.length === 0) {
      this.logger.error('Anthropic response contains no text blocks');
      throw new InternalServerErrorException(
        'Malformed Anthropic response: no text content',
      );
    }

    // Concatenate multiple text blocks with newline separator
    const output = textBlocks.join('\n\n');

    // Calculate total tokens used
    const tokensUsed =
      response.usage.input_tokens + response.usage.output_tokens;

    // Validate token counts
    if (
      typeof response.usage.input_tokens !== 'number' ||
      typeof response.usage.output_tokens !== 'number' ||
      response.usage.input_tokens < 0 ||
      response.usage.output_tokens < 0
    ) {
      this.logger.error('Invalid token counts in Anthropic response', {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
      throw new InternalServerErrorException(
        'Malformed Anthropic response: invalid token counts',
      );
    }

    // Extract model identifier (use response model or fallback to instance model)
    const model = response.model || this.model;

    this.logger.debug(
      `Anthropic response: output=${output.length} chars, tokens=${tokensUsed}, model=${model}`,
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
   * @param error - Error from Anthropic SDK
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

    this.logger.error('Anthropic API error', {
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Handle Anthropic SDK errors
    if (error instanceof Anthropic.APIError) {
      const status = error.status;

      // Check for specific error types first
      if (error.constructor.name === 'AuthenticationError' || status === 401) {
        throw new UnauthorizedException(
          'Invalid Anthropic API key',
          error.message,
        );
      }

      if (error.constructor.name === 'BadRequestError' || status === 400) {
        throw new BadRequestException(
          'Invalid request to Anthropic API',
          error.message,
        );
      }

      if (error.constructor.name === 'RateLimitError' || status === 429) {
        throw new ServiceUnavailableException(
          'Anthropic API rate limit exceeded',
          error.message,
        );
      }

      if (
        error.constructor.name === 'InternalServerError' ||
        (status && status >= 500 && status < 600)
      ) {
        throw new InternalServerErrorException(
          'Anthropic API server error',
          error.message,
        );
      }

      // Other API errors
      throw new InternalServerErrorException(
        'Anthropic API error',
        error.message,
      );
    }

    // Handle network/timeout errors
    if (error instanceof Error) {
      if (
        error.name === 'TimeoutError' ||
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT')
      ) {
        throw new ServiceUnavailableException(
          'Anthropic API timeout',
          error.message,
        );
      }

      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      ) {
        throw new ServiceUnavailableException(
          'Anthropic API connection error',
          error.message,
        );
      }
    }

    // Unknown error
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new InternalServerErrorException(
      'Unexpected error during Anthropic API call',
      errorMessage,
    );
  }
}
