import { Test, TestingModule } from '@nestjs/testing';
import { AIExecutionService } from '../ai-execution.service';
import { AIExecutionModule } from '../ai-execution.module';
import { AIExecutionRequest } from '../types';

/**
 * Stage C2-E: Verification Harness for AIExecutionService
 *
 * Purpose:
 * Verify that AIExecutionService correctly delegates to the injected adapter.
 *
 * What is verified:
 * 1. AIExecutionService can be resolved by NestJS DI
 * 2. execute() correctly delegates to the injected adapter
 * 3. The stub adapter is actually used at runtime
 * 4. Returned result matches the expected stub output
 *
 * This is a verification test only - no production behavior is added.
 */
describe('AIExecutionService (Stage C2-E Verification)', () => {
  let service: AIExecutionService;
  let module: TestingModule;

  beforeAll(async () => {
    // Create testing module with AIExecutionModule
    module = await Test.createTestingModule({
      imports: [AIExecutionModule],
    }).compile();

    // Resolve AIExecutionService from DI container
    service = module.get<AIExecutionService>(AIExecutionService);
  });

  afterAll(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute()', () => {
    it('should delegate to stub adapter and return deterministic result', async () => {
      // Arrange: Create a mock AIExecutionRequest
      const request: AIExecutionRequest = {
        sessionId: 'test-session-123',
        conversationId: 'test-conversation-456',
        userId: 'test-user-789',
        prompt: 'Test prompt for verification',
        metadata: { test: true },
      };

      // Act: Call execute()
      const result = await service.execute(request);

      // Assert: Verify stub adapter response
      expect(result).toBeDefined();
      expect(result.model).toBe('stub');
      expect(result.tokensUsed).toBe(0);
      expect(result.output).toContain('[STUB]');
      expect(result.output).toBe('[STUB] AI execution not implemented yet');
    });

    it('should return consistent results across multiple calls', async () => {
      // Arrange: Create two identical requests
      const request1: AIExecutionRequest = {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        prompt: 'First prompt',
      };

      const request2: AIExecutionRequest = {
        sessionId: 'session-2',
        conversationId: 'conv-2',
        userId: 'user-2',
        prompt: 'Second prompt',
      };

      // Act: Call execute() twice
      const result1 = await service.execute(request1);
      const result2 = await service.execute(request2);

      // Assert: Both results should be identical (deterministic stub)
      expect(result1.model).toBe(result2.model);
      expect(result1.tokensUsed).toBe(result2.tokensUsed);
      expect(result1.output).toBe(result2.output);

      // Assert: All stub characteristics present
      expect(result1.model).toBe('stub');
      expect(result2.model).toBe('stub');
      expect(result1.tokensUsed).toBe(0);
      expect(result2.tokensUsed).toBe(0);
    });
  });
});
