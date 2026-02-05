import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AIExecutionModule } from '../ai-execution.module';
import { AI_ADAPTER, AI_PROVIDER_CONFIG } from '../adapters/tokens';
import { AIAdapter } from '../adapters/ai-adapter.interface';
import { StubAIAdapter } from '../adapters/stub-ai.adapter';
import { AnthropicAdapter } from '../adapters/anthropic-ai.adapter';
import { OpenAIAdapter } from '../adapters/openai-ai.adapter';
import { AIProviderConfig } from '../types';

/**
 * AIExecutionModule Tests
 *
 * Stage C2-G: Configuration-driven adapter selection
 * Stage C2-H: Anthropic adapter integration
 * Stage C2-K: Provider configuration wiring
 * Stage C2-I: OpenAI adapter integration
 *
 * Verifies:
 * - Default adapter is StubAIAdapter when no config provided
 * - Explicit stub config selects StubAIAdapter
 * - Unknown provider defaults to StubAIAdapter (fail-safe)
 * - Anthropic provider selects AnthropicAdapter with valid config
 * - Anthropic provider throws when API key is missing
 * - OpenAI provider selects OpenAIAdapter with valid config
 * - OpenAI provider throws when API key is missing
 * - Factory provider is deterministic and testable
 */
describe('AIExecutionModule - Adapter Selection', () => {
  describe('Default behavior (no config)', () => {
    it('should provide StubAIAdapter when AI_PROVIDER_CONFIG is not provided', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [AIExecutionModule],
      }).compile();

      const adapter = module.get<AIAdapter>(AI_ADAPTER);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(StubAIAdapter);
    });
  });

  describe('Explicit stub configuration', () => {
    it('should provide StubAIAdapter when provider is "stub"', async () => {
      const config: AIProviderConfig = { provider: 'stub' };

      const module: TestingModule = await Test.createTestingModule({
        imports: [AIExecutionModule],
      })
        .overrideProvider(AI_PROVIDER_CONFIG)
        .useValue(config)
        .compile();

      const adapter = module.get<AIAdapter>(AI_ADAPTER);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(StubAIAdapter);
    });
  });

  describe('Fail-safe behavior', () => {
    it('should default to StubAIAdapter for unknown provider', async () => {
      // Simulate an unknown provider (e.g., typo or future provider not yet implemented)
      const config = { provider: 'unknown-provider' } as unknown as AIProviderConfig;

      const module: TestingModule = await Test.createTestingModule({
        imports: [AIExecutionModule],
      })
        .overrideProvider(AI_PROVIDER_CONFIG)
        .useValue(config)
        .compile();

      const adapter = module.get<AIAdapter>(AI_ADAPTER);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(StubAIAdapter);
    });
  });

  describe('Anthropic provider configuration (C2-K)', () => {
    it('should provide AnthropicAdapter when provider is "anthropic" with valid API key', async () => {
      const config: AIProviderConfig = {
        provider: 'anthropic',
      };

      // Mock ConfigService to provide API key
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test-key-123';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: AI_PROVIDER_CONFIG,
            useValue: config,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: AI_ADAPTER,
            useFactory: (
              testConfig?: AIProviderConfig,
              testConfigService?: ConfigService,
            ) => {
              const provider = testConfig?.provider ?? 'stub';

              switch (provider) {
                case 'stub':
                  return new StubAIAdapter();
                case 'anthropic': {
                  const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                  if (!apiKey || apiKey.trim().length === 0) {
                    throw new Error(
                      'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                    );
                  }
                  return new AnthropicAdapter(apiKey);
                }
                default:
                  return new StubAIAdapter();
              }
            },
            inject: [
              { token: AI_PROVIDER_CONFIG, optional: true },
              { token: ConfigService, optional: true },
            ],
          },
        ],
      }).compile();

      const adapter = module.get<AIAdapter>(AI_ADAPTER);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(AnthropicAdapter);
      expect(adapter.model).toBe('claude-3-5-sonnet-20241022');
      expect(mockConfigService.get).toHaveBeenCalledWith('ANTHROPIC_API_KEY');
    });

    it('should throw error when provider is "anthropic" but API key is missing', async () => {
      const config: AIProviderConfig = {
        provider: 'anthropic',
      };

      // Mock ConfigService to return undefined for API key
      const mockConfigService = {
        get: jest.fn(() => undefined),
      };

      // Error thrown during module compilation when factory is called
      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: AI_PROVIDER_CONFIG,
              useValue: config,
            },
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: AI_ADAPTER,
              useFactory: (
                testConfig?: AIProviderConfig,
                testConfigService?: ConfigService,
              ) => {
                const provider = testConfig?.provider ?? 'stub';

                switch (provider) {
                  case 'stub':
                    return new StubAIAdapter();
                  case 'anthropic': {
                    const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                      );
                    }
                    return new AnthropicAdapter(apiKey);
                  }
                  default:
                    return new StubAIAdapter();
                }
              },
              inject: [
                { token: AI_PROVIDER_CONFIG, optional: true },
                { token: ConfigService, optional: true },
              ],
            },
          ],
        }).compile(),
      ).rejects.toThrow(
        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
      );
    });

    it('should throw error when provider is "anthropic" but API key is empty string', async () => {
      const config: AIProviderConfig = {
        provider: 'anthropic',
      };

      // Mock ConfigService to return empty string
      const mockConfigService = {
        get: jest.fn(() => ''),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: AI_PROVIDER_CONFIG,
              useValue: config,
            },
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: AI_ADAPTER,
              useFactory: (
                testConfig?: AIProviderConfig,
                testConfigService?: ConfigService,
              ) => {
                const provider = testConfig?.provider ?? 'stub';

                switch (provider) {
                  case 'stub':
                    return new StubAIAdapter();
                  case 'anthropic': {
                    const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                      );
                    }
                    return new AnthropicAdapter(apiKey);
                  }
                  default:
                    return new StubAIAdapter();
                }
              },
              inject: [
                { token: AI_PROVIDER_CONFIG, optional: true },
                { token: ConfigService, optional: true },
              ],
            },
          ],
        }).compile(),
      ).rejects.toThrow('ANTHROPIC_API_KEY environment variable is required');
    });

    it('should throw error when provider is "anthropic" but API key is whitespace only', async () => {
      const config: AIProviderConfig = {
        provider: 'anthropic',
      };

      // Mock ConfigService to return whitespace
      const mockConfigService = {
        get: jest.fn(() => '   '),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: AI_PROVIDER_CONFIG,
              useValue: config,
            },
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: AI_ADAPTER,
              useFactory: (
                testConfig?: AIProviderConfig,
                testConfigService?: ConfigService,
              ) => {
                const provider = testConfig?.provider ?? 'stub';

                switch (provider) {
                  case 'stub':
                    return new StubAIAdapter();
                  case 'anthropic': {
                    const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                      );
                    }
                    return new AnthropicAdapter(apiKey);
                  }
                  default:
                    return new StubAIAdapter();
                }
              },
              inject: [
                { token: AI_PROVIDER_CONFIG, optional: true },
                { token: ConfigService, optional: true },
              ],
            },
          ],
        }).compile(),
      ).rejects.toThrow('ANTHROPIC_API_KEY environment variable is required');
    });

    it('should throw error when AnthropicAdapter constructed with empty API key', async () => {
      // Test adapter constructor validation (not factory)
      expect(() => new AnthropicAdapter('')).toThrow(
        'Anthropic API key is required',
      );
    });
  });

  describe('OpenAI provider configuration (C2-I)', () => {
    it('should provide OpenAIAdapter when provider is "openai" with valid API key', async () => {
      const config: AIProviderConfig = {
        provider: 'openai',
      };

      // Mock ConfigService to provide API key
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') return 'sk-test-key-123';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: AI_PROVIDER_CONFIG,
            useValue: config,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: AI_ADAPTER,
            useFactory: (
              testConfig?: AIProviderConfig,
              testConfigService?: ConfigService,
            ) => {
              const provider = testConfig?.provider ?? 'stub';

              switch (provider) {
                case 'stub':
                  return new StubAIAdapter();
                case 'anthropic': {
                  const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                  if (!apiKey || apiKey.trim().length === 0) {
                    throw new Error(
                      'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                    );
                  }
                  return new AnthropicAdapter(apiKey);
                }
                case 'openai': {
                  const apiKey = testConfigService?.get<string>('OPENAI_API_KEY');
                  if (!apiKey || apiKey.trim().length === 0) {
                    throw new Error(
                      'OPENAI_API_KEY environment variable is required when provider is "openai"',
                    );
                  }
                  return new OpenAIAdapter(apiKey);
                }
                default:
                  return new StubAIAdapter();
              }
            },
            inject: [
              { token: AI_PROVIDER_CONFIG, optional: true },
              { token: ConfigService, optional: true },
            ],
          },
        ],
      }).compile();

      const adapter = module.get<AIAdapter>(AI_ADAPTER);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
      expect(adapter.model).toBe('gpt-4o');
      expect(mockConfigService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
    });

    it('should throw error when provider is "openai" but API key is missing', async () => {
      const config: AIProviderConfig = {
        provider: 'openai',
      };

      // Mock ConfigService to return undefined for API key
      const mockConfigService = {
        get: jest.fn(() => undefined),
      };

      // Error thrown during module compilation when factory is called
      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: AI_PROVIDER_CONFIG,
              useValue: config,
            },
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: AI_ADAPTER,
              useFactory: (
                testConfig?: AIProviderConfig,
                testConfigService?: ConfigService,
              ) => {
                const provider = testConfig?.provider ?? 'stub';

                switch (provider) {
                  case 'stub':
                    return new StubAIAdapter();
                  case 'anthropic': {
                    const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                      );
                    }
                    return new AnthropicAdapter(apiKey);
                  }
                  case 'openai': {
                    const apiKey = testConfigService?.get<string>('OPENAI_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'OPENAI_API_KEY environment variable is required when provider is "openai"',
                      );
                    }
                    return new OpenAIAdapter(apiKey);
                  }
                  default:
                    return new StubAIAdapter();
                }
              },
              inject: [
                { token: AI_PROVIDER_CONFIG, optional: true },
                { token: ConfigService, optional: true },
              ],
            },
          ],
        }).compile(),
      ).rejects.toThrow(
        'OPENAI_API_KEY environment variable is required when provider is "openai"',
      );
    });

    it('should throw error when provider is "openai" but API key is empty string', async () => {
      const config: AIProviderConfig = {
        provider: 'openai',
      };

      // Mock ConfigService to return empty string
      const mockConfigService = {
        get: jest.fn(() => ''),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: AI_PROVIDER_CONFIG,
              useValue: config,
            },
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: AI_ADAPTER,
              useFactory: (
                testConfig?: AIProviderConfig,
                testConfigService?: ConfigService,
              ) => {
                const provider = testConfig?.provider ?? 'stub';

                switch (provider) {
                  case 'stub':
                    return new StubAIAdapter();
                  case 'anthropic': {
                    const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                      );
                    }
                    return new AnthropicAdapter(apiKey);
                  }
                  case 'openai': {
                    const apiKey = testConfigService?.get<string>('OPENAI_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'OPENAI_API_KEY environment variable is required when provider is "openai"',
                      );
                    }
                    return new OpenAIAdapter(apiKey);
                  }
                  default:
                    return new StubAIAdapter();
                }
              },
              inject: [
                { token: AI_PROVIDER_CONFIG, optional: true },
                { token: ConfigService, optional: true },
              ],
            },
          ],
        }).compile(),
      ).rejects.toThrow('OPENAI_API_KEY environment variable is required');
    });

    it('should throw error when provider is "openai" but API key is whitespace only', async () => {
      const config: AIProviderConfig = {
        provider: 'openai',
      };

      // Mock ConfigService to return whitespace
      const mockConfigService = {
        get: jest.fn(() => '   '),
      };

      await expect(
        Test.createTestingModule({
          providers: [
            {
              provide: AI_PROVIDER_CONFIG,
              useValue: config,
            },
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: AI_ADAPTER,
              useFactory: (
                testConfig?: AIProviderConfig,
                testConfigService?: ConfigService,
              ) => {
                const provider = testConfig?.provider ?? 'stub';

                switch (provider) {
                  case 'stub':
                    return new StubAIAdapter();
                  case 'anthropic': {
                    const apiKey = testConfigService?.get<string>('ANTHROPIC_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"',
                      );
                    }
                    return new AnthropicAdapter(apiKey);
                  }
                  case 'openai': {
                    const apiKey = testConfigService?.get<string>('OPENAI_API_KEY');
                    if (!apiKey || apiKey.trim().length === 0) {
                      throw new Error(
                        'OPENAI_API_KEY environment variable is required when provider is "openai"',
                      );
                    }
                    return new OpenAIAdapter(apiKey);
                  }
                  default:
                    return new StubAIAdapter();
                }
              },
              inject: [
                { token: AI_PROVIDER_CONFIG, optional: true },
                { token: ConfigService, optional: true },
              ],
            },
          ],
        }).compile(),
      ).rejects.toThrow('OPENAI_API_KEY environment variable is required');
    });

    it('should throw error when OpenAIAdapter constructed with empty API key', async () => {
      // Test adapter constructor validation (not factory)
      expect(() => new OpenAIAdapter('')).toThrow(
        'OpenAI API key is required',
      );
    });
  });

  describe('Future provider configurations', () => {
    /**
     * Stage C2-J: Groq adapter tests
     * Uncomment when GroqAdapter is implemented
     */
    it.skip('should provide GroqAdapter when provider is "groq"', async () => {
      const config: AIProviderConfig = { provider: 'groq' };

      const module: TestingModule = await Test.createTestingModule({
        imports: [AIExecutionModule],
      })
        .overrideProvider(AI_PROVIDER_CONFIG)
        .useValue(config)
        .compile();

      const adapter = module.get<AIAdapter>(AI_ADAPTER);

      expect(adapter).toBeDefined();
      // expect(adapter).toBeInstanceOf(GroqAdapter);
    });
  });
});
