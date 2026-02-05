import { Test, TestingModule } from '@nestjs/testing';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicAdapter } from '../anthropic-ai.adapter';
import { AIExecutionRequest } from '../../types';
import {
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';

// Mock the entire Anthropic SDK
jest.mock('@anthropic-ai/sdk');

/**
 * AnthropicAdapter Unit Tests
 *
 * Stage C2-H: Anthropic Adapter Implementation
 *
 * Test Strategy:
 * - SDK is fully mocked (no network calls)
 * - Tests validate request transformation logic
 * - Tests validate response transformation logic
 * - Tests validate error handling (throw-only)
 * - Tests validate token calculation
 * - No external dependencies required
 */
describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;
  let mockClient: jest.Mocked<Anthropic>;
  let mockMessagesCreate: jest.Mock;

  const validApiKey = 'test-api-key';
  const mockRequest: AIExecutionRequest = {
    sessionId: 'session-123',
    conversationId: 'conv-456',
    userId: 'user-789',
    prompt: 'Hello, Claude!',
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock messages.create method
    mockMessagesCreate = jest.fn();

    // Mock Anthropic constructor
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () =>
        ({
          messages: {
            create: mockMessagesCreate,
          },
        }) as unknown as Anthropic,
    );

    // Create adapter instance
    adapter = new AnthropicAdapter(validApiKey);
    mockClient = (adapter as any).client;
  });

  describe('Constructor', () => {
    it('should construct successfully with valid API key', () => {
      const adapter = new AnthropicAdapter('valid-key');

      expect(adapter).toBeDefined();
      expect(adapter.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should throw error if API key is missing', () => {
      expect(() => new AnthropicAdapter('')).toThrow(
        'Anthropic API key is required',
      );
    });

    it('should throw error if API key is whitespace only', () => {
      expect(() => new AnthropicAdapter('   ')).toThrow(
        'Anthropic API key is required',
      );
    });

    it('should accept custom model in options', () => {
      const adapter = new AnthropicAdapter('valid-key', {
        model: 'claude-3-opus-20240229',
      });

      expect(adapter.model).toBe('claude-3-opus-20240229');
    });

    it('should pass timeout to Anthropic client', () => {
      new AnthropicAdapter('valid-key', {
        timeout: 30000,
      });

      expect(Anthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'valid-key',
          timeout: 30000,
        }),
      );
    });

    it('should pass baseURL to Anthropic client', () => {
      new AnthropicAdapter('valid-key', {
        baseURL: 'https://custom-api.example.com',
      });

      expect(Anthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'valid-key',
          baseURL: 'https://custom-api.example.com',
        }),
      );
    });
  });

  describe('execute() - Request Mapping', () => {
    it('should transform AIExecutionRequest to Anthropic format', async () => {
      // Mock successful response
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, human!' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await adapter.execute(mockRequest);

      // Verify SDK was called with correct format
      expect(mockMessagesCreate).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 1.0,
        messages: [
          {
            role: 'user',
            content: 'Hello, Claude!',
          },
        ],
      });
    });

    it('should use custom model from adapter options', async () => {
      const customAdapter = new AnthropicAdapter('valid-key', {
        model: 'claude-3-opus-20240229',
      });

      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-opus-20240229',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await customAdapter.execute(mockRequest);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
        }),
      );
    });

    it('should map prompt to messages array with user role', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const requestWithLongPrompt: AIExecutionRequest = {
        ...mockRequest,
        prompt: 'This is a longer prompt with multiple sentences.',
      };

      await adapter.execute(requestWithLongPrompt);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: 'This is a longer prompt with multiple sentences.',
            },
          ],
        }),
      );
    });
  });

  describe('execute() - Response Mapping', () => {
    it('should extract text output from single content block', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, human!' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await adapter.execute(mockRequest);

      expect(result.output).toBe('Hello, human!');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should concatenate multiple text blocks with double newline', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'First paragraph.' },
          { type: 'text', text: 'Second paragraph.' },
          { type: 'text', text: 'Third paragraph.' },
        ],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 15 },
      });

      const result = await adapter.execute(mockRequest);

      expect(result.output).toBe(
        'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
      );
    });

    it('should calculate tokensUsed as sum of input and output tokens', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await adapter.execute(mockRequest);

      expect(result.tokensUsed).toBe(150);
    });

    it('should return zero tokensUsed if both counts are zero', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      const result = await adapter.execute(mockRequest);

      expect(result.tokensUsed).toBe(0);
    });

    it('should use response model field', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await adapter.execute(mockRequest);

      expect(result.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should return empty string for empty text content', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 0 },
      });

      const result = await adapter.execute(mockRequest);

      expect(result.output).toBe('');
    });
  });

  describe('execute() - Error Handling: Malformed Responses', () => {
    it('should throw if response missing content field', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        // content field missing
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Malformed Anthropic response: missing content',
      );
    });

    it('should throw if content array is empty', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [], // Empty array
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Malformed Anthropic response: missing content',
      );
    });

    it('should throw if content contains no text blocks', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'image', source: {} }], // Non-text block
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Malformed Anthropic response: no text content',
      );
    });

    it('should throw if response missing usage field', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        // usage field missing
      });

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Malformed Anthropic response: missing usage',
      );
    });

    it('should throw if usage.input_tokens is negative', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: -10, output_tokens: 5 },
      });

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'invalid token counts',
      );
    });

    it('should throw if usage.output_tokens is negative', async () => {
      mockMessagesCreate.mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: -5 },
      });

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'invalid token counts',
      );
    });
  });

  describe('execute() - Error Handling: API Errors', () => {
    it('should throw UnauthorizedException for 401 errors', async () => {
      // Create a mock API error with status field
      const apiError = new Error('Invalid API key') as any;
      apiError.status = 401;
      apiError.constructor = { name: 'APIError' };
      // Make it pass instanceof check
      Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);

      mockMessagesCreate.mockRejectedValue(apiError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Invalid Anthropic API key',
      );
    });

    it('should throw BadRequestException for 400 errors', async () => {
      const apiError = new Error('Invalid request') as any;
      apiError.status = 400;
      apiError.constructor = { name: 'APIError' };
      Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);

      mockMessagesCreate.mockRejectedValue(apiError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Invalid request to Anthropic API',
      );
    });

    it('should throw ServiceUnavailableException for 429 rate limit errors', async () => {
      const apiError = new Error('Rate limit exceeded') as any;
      apiError.status = 429;
      apiError.constructor = { name: 'APIError' };
      Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);

      mockMessagesCreate.mockRejectedValue(apiError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API rate limit exceeded',
      );
    });

    it('should throw InternalServerErrorException for 500 errors', async () => {
      const apiError = new Error('Server error') as any;
      apiError.status = 500;
      apiError.constructor = { name: 'APIError' };
      Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);

      mockMessagesCreate.mockRejectedValue(apiError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API server error',
      );
    });

    it('should throw InternalServerErrorException for 503 errors', async () => {
      const apiError = new Error('Service unavailable') as any;
      apiError.status = 503;
      apiError.constructor = { name: 'APIError' };
      Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);

      mockMessagesCreate.mockRejectedValue(apiError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API server error',
      );
    });

    it('should throw InternalServerErrorException for unknown API errors', async () => {
      const apiError = new Error("I'm a teapot") as any;
      apiError.status = 418;
      apiError.constructor = { name: 'APIError' };
      Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);

      mockMessagesCreate.mockRejectedValue(apiError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API error',
      );
    });
  });

  describe('execute() - Error Handling: Network Errors', () => {
    it('should throw ServiceUnavailableException for timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockMessagesCreate.mockRejectedValue(timeoutError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API timeout',
      );
    });

    it('should throw ServiceUnavailableException for ETIMEDOUT errors', async () => {
      const timeoutError = new Error('ETIMEDOUT: connection timeout');
      mockMessagesCreate.mockRejectedValue(timeoutError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API timeout',
      );
    });

    it('should throw ServiceUnavailableException for ECONNREFUSED errors', async () => {
      const connError = new Error('ECONNREFUSED: connection refused');
      mockMessagesCreate.mockRejectedValue(connError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API connection error',
      );
    });

    it('should throw ServiceUnavailableException for ENOTFOUND errors', async () => {
      const dnsError = new Error('ENOTFOUND: DNS lookup failed');
      mockMessagesCreate.mockRejectedValue(dnsError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Anthropic API connection error',
      );
    });

    it('should throw InternalServerErrorException for unknown errors', async () => {
      const unknownError = new Error('Something went wrong');
      mockMessagesCreate.mockRejectedValue(unknownError);

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Unexpected error during Anthropic API call',
      );
    });

    it('should throw InternalServerErrorException for non-Error objects', async () => {
      mockMessagesCreate.mockRejectedValue('string error');

      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(adapter.execute(mockRequest)).rejects.toThrow(
        'Unexpected error during Anthropic API call',
      );
    });
  });
});
