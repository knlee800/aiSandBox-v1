# PHASE 12B — STAGE C2-I DESIGN SPECIFICATION

**OpenAI Adapter (Design Only)**

---

## STATUS

**DESIGN ONLY — NOT IMPLEMENTED**

Date: 2026-02-04

Stage: C2-I

---

## OVERVIEW

This document defines the design specification for the OpenAIAdapter implementation. This is a **DESIGN-ONLY** document. No implementation has been performed.

The OpenAIAdapter will enable AI execution via OpenAI's Chat Completions API, following the same structural patterns established by AnthropicAdapter (C2-H) and configuration wiring from C2-K.

---

## GOAL & NON-GOALS

### Goal

Design the OpenAIAdapter implementation to:
- Enable AI execution via OpenAI's Chat Completions API
- Follow structural patterns from AnthropicAdapter (C2-H)
- Integrate with ConfigService-based configuration (C2-K pattern)
- Maintain all locked invariants from previous stages
- Provide deterministic, testable, stateless adapter

### Non-Goals

The following are **explicitly out of scope** for Stage C2-I:

- ❌ Streaming responses (future enhancement)
- ❌ Function calling / tool use (future enhancement)
- ❌ Multi-turn conversation history management (adapters are stateless)
- ❌ Vision/image inputs (future enhancement)
- ❌ Fine-tuned model management
- ❌ Token recording or billing logic (handled by AIExecutionService per ADR-12B)
- ❌ Authentication beyond API key
- ❌ Rate limiting or quota enforcement (external concern)
- ❌ Response caching
- ❌ Retry logic (let SDK or orchestrator handle)
- ❌ Changing AIAdapter interface, AIExecutionRequest, or AIExecutionResult
- ❌ Modifying existing adapters (AnthropicAdapter, StubAIAdapter)
- ❌ Modifying configuration patterns from C2-K

---

## LOCKED INVARIANTS (CANNOT CHANGE)

The following contracts and behaviors are **LOCKED** from previous stages and MUST NOT be modified:

### Interface Contracts (Stage C2-A)

```typescript
interface AIExecutionRequest {
  sessionId: string;
  conversationId: string;
  userId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

interface AIExecutionResult {
  output: string;
  tokensUsed: number;
  model: string;
}

interface AIAdapter {
  readonly model: string;
  execute(request: AIExecutionRequest): Promise<AIExecutionResult>;
}
```

**Status:** LOCKED — No modifications permitted

---

### Configuration Contracts (Stage C2-G)

```typescript
interface AIProviderConfig {
  provider: 'stub' | 'anthropic' | 'openai' | 'groq';
}
```

**Invariants:**
- AIProviderConfig is selector-only (no nested configuration)
- Provider-specific config (API keys, options) resolved via ConfigService
- AI_PROVIDER_CONFIG token is optional in DI
- Factory provider pattern for AI_ADAPTER

**Status:** LOCKED — No modifications permitted

---

### Configuration Wiring Pattern (Stage C2-K)

- ConfigModule integrated globally in AppModule
- ConfigService injected into AI_ADAPTER factory provider
- Environment variables resolved via `ConfigService.get<string>('KEY_NAME')`
- Fail-fast validation when provider is selected
- Optional ConfigService injection (preserves default stub behavior)

**Status:** LOCKED — No modifications permitted

---

### Error Semantics

- Throw-only error handling (no error payloads in AIExecutionResult)
- Clear error messages for missing configuration
- Fail-fast validation at module initialization
- No silent fallbacks for configuration errors
- Use NestJS HTTP exceptions

**Status:** LOCKED — No modifications permitted

---

### Default Behavior

- StubAIAdapter remains default when no config provided
- Unknown providers fall back to StubAIAdapter
- No breaking changes to existing integrations

**Status:** LOCKED — No modifications permitted

---

## ADAPTER RESPONSIBILITIES & BOUNDARIES

### Responsibilities

The OpenAIAdapter MUST:

1. **Implement AIAdapter interface exactly**
   - Provide `readonly model: string` property
   - Implement `execute(request: AIExecutionRequest): Promise<AIExecutionResult>` method

2. **Transform AIExecutionRequest → OpenAI Chat Completions API request**
   - Map `request.prompt` to messages array format
   - Set model, temperature, max_tokens parameters
   - Use single-turn conversation format

3. **Execute requests via OpenAI SDK**
   - Use official `openai` npm package
   - Leverage SDK for HTTP communication

4. **Transform OpenAI response → AIExecutionResult**
   - Extract text content from `choices[0].message.content`
   - Extract token usage from `usage.total_tokens`
   - Extract model identifier from `model` field

5. **Throw on all failures**
   - No error payloads in result
   - Map SDK errors to NestJS HTTP exceptions
   - Provide clear error messages

6. **Be stateless**
   - No conversation history management
   - No instance state beyond configuration
   - Each execute() call is independent

7. **Be deterministic**
   - Same request → same behavior
   - No randomness in request transformation

8. **Validate API key at construction**
   - Fail-fast if API key is missing or invalid
   - Throw clear error message

### Boundaries (What OpenAIAdapter Does NOT Do)

- ❌ Does NOT read environment variables directly (factory provides config)
- ❌ Does NOT record or persist tokens (AIExecutionService handles recording per ADR-12B)
- ❌ Does NOT perform billing calculations (external concern)
- ❌ Does NOT manage conversation history (single-turn execution only)
- ❌ Does NOT implement retry logic (let SDK handle, or orchestrator decides)
- ❌ Does NOT cache responses
- ❌ Does NOT implement rate limiting
- ❌ Does NOT modify request.sessionId, conversationId, userId, or metadata
- ❌ Does NOT validate prompt content (accepts as-is)

---

## CONFIGURATION EXPECTATIONS

### Required Configuration

**OPENAI_API_KEY** (string, non-empty)

- **Environment variable name:** `OPENAI_API_KEY`
- **Resolution method:** Factory provider via `ConfigService.get<string>('OPENAI_API_KEY')`
- **Validation rules:**
  - Must be non-null
  - Must be non-empty string
  - Must not be whitespace-only
- **Error if missing:** `"OPENAI_API_KEY environment variable is required when provider is \"openai\""`
- **Validation location:** AI_ADAPTER factory provider (same pattern as C2-K)

### Optional Configuration

**Constructor Signature (Design):**

```typescript
constructor(
  apiKey: string,
  options?: {
    model?: string;           // Default: 'gpt-4o'
    maxTokens?: number;       // Default: 4096
    temperature?: number;     // Default: 1.0
    timeout?: number;         // Default: SDK default (60s)
    baseURL?: string;         // Default: SDK default (https://api.openai.com/v1)
    organization?: string;    // Default: undefined
  }
)
```

**Default Values:**

| Parameter | Default Value | Rationale |
|-----------|--------------|-----------|
| `model` | `'gpt-4o'` | Most capable multimodal model (as of 2025) |
| `maxTokens` | `4096` | Aligned with AnthropicAdapter default |
| `temperature` | `1.0` | Aligned with AnthropicAdapter default |
| `timeout` | SDK default (60s) | Let SDK manage timeouts |
| `baseURL` | SDK default | OpenAI production endpoint |
| `organization` | `undefined` | Not required for most use cases |

**Design Rationale:**
- Structural alignment with AnthropicAdapter constructor
- Defaults match production-ready configuration
- Optional parameters allow testing and custom deployments
- Constructor-level configuration for adapter behavior
- Environment-level configuration for secrets (API key)

### Environment Variable Documentation

**File:** `.env.example`

```bash
# OpenAI API Configuration (C2-I: OpenAI Adapter)
# Required when AI_PROVIDER is set to "openai"
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-api-key-here
```

---

## REQUEST MAPPING

### AIExecutionRequest → OpenAI Chat Completions API

**Input Contract (LOCKED):**

```typescript
interface AIExecutionRequest {
  sessionId: string;        // NOT sent to OpenAI (internal tracking)
  conversationId: string;   // NOT sent to OpenAI (internal tracking)
  userId: string;           // NOT sent to OpenAI (internal tracking)
  prompt: string;           // → messages[0].content
  metadata?: Record<...>;   // NOT sent to OpenAI (internal use only)
}
```

**OpenAI Request Format:**

```typescript
{
  model: this.model,              // e.g., 'gpt-4o'
  max_tokens: this.maxTokens,     // e.g., 4096
  temperature: this.temperature,  // e.g., 1.0
  messages: [
    {
      role: 'user',
      content: request.prompt     // Direct mapping from AIExecutionRequest
    }
  ]
}
```

**Mapping Rules:**

1. **Prompt Mapping:**
   - `request.prompt` → `messages[0].content` (direct mapping)
   - `messages[0].role` = `'user'` (single-turn, stateless execution)

2. **Internal Fields (NOT sent to OpenAI):**
   - `sessionId` — Internal tracking only, not included in API request
   - `conversationId` — Internal tracking only, not included in API request
   - `userId` — Internal tracking only, not included in API request
   - `metadata` — Internal use only, not included in API request

3. **Instance Configuration:**
   - Use instance-level `this.model` for all requests
   - Use instance-level `this.maxTokens` for all requests
   - Use instance-level `this.temperature` for all requests

4. **Message Format:**
   - Single user message per request (stateless adapter design)
   - No system messages (can be added in future enhancement)
   - No assistant messages (no conversation history)

**SDK Invocation Pattern:**

```typescript
const response = await this.client.chat.completions.create({
  model: this.model,
  max_tokens: this.maxTokens,
  temperature: this.temperature,
  messages: [
    { role: 'user', content: request.prompt }
  ]
});
```

---

## RESPONSE MAPPING

### OpenAI Chat Completions Response → AIExecutionResult

**OpenAI Response Structure:**

```typescript
{
  id: string,
  model: string,                    // Actual model used (e.g., 'gpt-4o-2024-11-20')
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: string | null      // AI-generated text
      },
      finish_reason: string
    }
  ],
  usage: {
    prompt_tokens: number,          // Input tokens
    completion_tokens: number,      // Output tokens
    total_tokens: number            // Sum of both
  }
}
```

**AIExecutionResult Extraction Rules:**

### 1. output (string)

**Source:** `response.choices[0].message.content`

**Validation:**
- Must be non-null
- Must be non-empty after trimming
- Must be string type

**Error Handling:**
- If `choices` is missing or empty: `InternalServerErrorException("Malformed OpenAI response: missing choices")`
- If `content` is null: `InternalServerErrorException("Malformed OpenAI response: missing content")`
- If `content` is empty string: `InternalServerErrorException("Malformed OpenAI response: empty content")`

**Edge Cases:**
- Multiple choices: Use first choice only (`choices[0]`)
- Whitespace-only content: Treat as error (empty content)

### 2. tokensUsed (number)

**Primary Source:** `response.usage.total_tokens`

**Alternative Calculation (if needed):** `response.usage.prompt_tokens + response.usage.completion_tokens`

**Validation:**
- Must be present
- Must be number type
- Must be >= 0

**Error Handling:**
- If `usage` is missing: `InternalServerErrorException("Malformed OpenAI response: missing usage")`
- If `total_tokens` is not a number: `InternalServerErrorException("Malformed OpenAI response: invalid token count")`
- If `total_tokens` < 0: `InternalServerErrorException("Malformed OpenAI response: negative token count")`

**Rationale:**
- OpenAI provides accurate `total_tokens` directly
- No manual calculation needed (simpler than Anthropic's separate input/output tokens)

### 3. model (string)

**Primary Source:** `response.model`

**Fallback:** `this.model` (instance configuration)

**Validation:**
- Must be non-empty string

**Rationale:**
- OpenAI returns actual model used (e.g., `'gpt-4o-2024-11-20'`)
- Useful for tracking model versions
- Fallback ensures field is never empty

### Transform Function Design

**Method Signature:**

```typescript
private transformResponse(
  response: OpenAI.Chat.Completions.ChatCompletion
): AIExecutionResult
```

**Implementation Steps:**

1. Validate `response.choices` exists and has length > 0
2. Extract `content` from `response.choices[0].message.content`
3. Validate `content` is non-null and non-empty
4. Validate `response.usage` exists
5. Validate `response.usage.total_tokens` is valid number >= 0
6. Extract `model` from `response.model` (fallback to `this.model`)
7. Return `{ output, tokensUsed, model }`

**Alignment with AnthropicAdapter:**

| Aspect | AnthropicAdapter | OpenAIAdapter |
|--------|------------------|---------------|
| Content extraction | `response.content[0].text` | `response.choices[0].message.content` |
| Token calculation | `input_tokens + output_tokens` | `total_tokens` (direct) |
| Model extraction | `response.model` or fallback | `response.model` or fallback |
| Validation | Strict (throw on malformed) | Strict (throw on malformed) |
| Multiple blocks/choices | Concatenate text blocks | Use first choice only |

---

## TOKEN ACCOUNTING STRATEGY (DESIGN ONLY)

### OpenAI Token Usage Structure

OpenAI provides token usage via `usage` object in response:

```typescript
{
  prompt_tokens: number,        // Input tokens (user prompt)
  completion_tokens: number,    // Output tokens (AI response)
  total_tokens: number          // Sum of both (authoritative)
}
```

### Extraction Strategy

**Primary Approach:** Use `response.usage.total_tokens` directly

**Advantages:**
- Simple and accurate
- Provided by OpenAI's internal tokenizer
- No manual calculation needed
- Matches OpenAI's billing metrics

**Validation Rules:**
1. Ensure `usage` object exists
2. Ensure `total_tokens` is present
3. Ensure `total_tokens` is number type
4. Ensure `total_tokens` >= 0
5. Optionally validate `prompt_tokens` and `completion_tokens` are also valid

**Alternative Calculation (Fallback):**

If `total_tokens` is missing but components exist:
```typescript
tokensUsed = response.usage.prompt_tokens + response.usage.completion_tokens
```

**Not Recommended:** Do NOT calculate tokens client-side using tokenizer libraries
- Adds complexity and dependencies
- May not match OpenAI's internal tokenization
- OpenAI already provides accurate counts

### Recording Strategy

**Adapter Responsibility:**
- Extract `tokensUsed` from OpenAI response
- Return in AIExecutionResult
- **DO NOT persist, record, or bill tokens**

**Service Responsibility (AIExecutionService):**
- Receive AIExecutionResult from adapter
- Record tokens via ADR-12B pattern
- Handle billing and quota enforcement

**Design Principle:** Separation of concerns
- Adapter = extraction
- Service = recording
- Billing system = enforcement

### Alignment with AnthropicAdapter

| Provider | Token Fields | Extraction Method | Result Field |
|----------|--------------|-------------------|--------------|
| Anthropic | `input_tokens`, `output_tokens` | Sum both fields | `tokensUsed` |
| OpenAI | `prompt_tokens`, `completion_tokens`, `total_tokens` | Use `total_tokens` | `tokensUsed` |

Both adapters return single `tokensUsed` number in AIExecutionResult (contract compliance).

---

## ERROR HANDLING SEMANTICS

### Throw-Only Error Handling

**Design Principle:** All errors MUST throw exceptions. No error payloads in AIExecutionResult.

**Rationale:**
- Consistent with AIAdapter contract (no error field in AIExecutionResult)
- Aligned with AnthropicAdapter error handling
- Simplifies error propagation through orchestrator
- Enables NestJS exception filters and error handling middleware

### Error Categories & NestJS Exception Mapping

| OpenAI Error Condition | HTTP Status | NestJS Exception | Error Message |
|------------------------|-------------|------------------|---------------|
| Invalid API Key | 401 | `UnauthorizedException` | "Invalid OpenAI API key" |
| Invalid Request | 400 | `BadRequestException` | "Invalid request to OpenAI API" |
| Rate Limit Exceeded | 429 | `ServiceUnavailableException` | "OpenAI API rate limit exceeded" |
| Server Error | 500-599 | `InternalServerErrorException` | "OpenAI API server error" |
| Timeout | - | `ServiceUnavailableException` | "OpenAI API timeout" |
| Network Error (ECONNREFUSED) | - | `ServiceUnavailableException` | "OpenAI API connection error" |
| Network Error (ENOTFOUND) | - | `ServiceUnavailableException` | "OpenAI API connection error" |
| Malformed Response (missing choices) | - | `InternalServerErrorException` | "Malformed OpenAI response: missing choices" |
| Malformed Response (missing content) | - | `InternalServerErrorException` | "Malformed OpenAI response: missing content" |
| Malformed Response (missing usage) | - | `InternalServerErrorException` | "Malformed OpenAI response: missing usage" |
| Invalid Token Counts | - | `InternalServerErrorException` | "Malformed OpenAI response: invalid token counts" |
| Unknown Error | - | `InternalServerErrorException` | "Unexpected error during OpenAI API call" |

### Error Handler Design

**Method Signature:**

```typescript
private handleError(error: unknown, request: AIExecutionRequest): never
```

**Implementation Pattern:**

1. **Re-throw NestJS exceptions** (if error is already a NestJS exception)
   - Preserves exception type through call stack
   - No transformation needed

2. **Log error with context**
   - Include sessionId and conversationId for tracing
   - Log original error message

3. **Handle OpenAI SDK errors** (check for status code)
   - SDK errors have `status` property
   - Map status codes to NestJS exceptions

4. **Handle network/timeout errors**
   - Check error name and message patterns
   - Map to `ServiceUnavailableException`

5. **Unknown error fallback**
   - Always throw `InternalServerErrorException`
   - Include original error message if available

### Logging Strategy

**Error Logging:**
- Log ALL errors before throwing
- Include request context (sessionId, conversationId)
- Log original error message
- Use `Logger.error()` method

**Debug Logging:**
- Log request execution start (debug level)
- Log response summary (debug level)
- Include token counts and model in response log

**Design Rationale:**
- Enables request tracing across services
- Facilitates debugging production issues
- Aligned with AnthropicAdapter logging pattern

### Alignment with AnthropicAdapter

Both adapters follow identical error handling patterns:
- Throw-only semantics
- Same NestJS exception types
- Same error categories (401, 400, 429, 500, timeout, network)
- Same logging approach
- Same `handleError()` method signature

---

## FACTORY PROVIDER INTEGRATION (DESIGN)

### Current Factory Pattern (C2-K)

The AI_ADAPTER factory provider currently supports:
- `'stub'` → StubAIAdapter
- `'anthropic'` → AnthropicAdapter (with ANTHROPIC_API_KEY validation)
- Unknown provider → StubAIAdapter (fail-safe default)

### Required Change: Add OpenAI Case

**File:** `src/ai-execution/ai-execution.module.ts`

**Design Change:** Add `case 'openai'` to factory switch statement

**Pseudo-Implementation (Design Only):**

```typescript
{
  provide: AI_ADAPTER,
  useFactory: (
    config?: AIProviderConfig,
    configService?: ConfigService
  ): AIAdapter => {
    const provider = config?.provider ?? 'stub';

    switch (provider) {
      case 'stub':
        return new StubAIAdapter();

      case 'anthropic': {
        const apiKey = configService?.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey || apiKey.trim().length === 0) {
          throw new Error(
            'ANTHROPIC_API_KEY environment variable is required when provider is "anthropic"'
          );
        }
        return new AnthropicAdapter(apiKey);
      }

      // C2-I: Add this case
      case 'openai': {
        const apiKey = configService?.get<string>('OPENAI_API_KEY');

        // Fail-fast validation
        if (!apiKey || apiKey.trim().length === 0) {
          throw new Error(
            'OPENAI_API_KEY environment variable is required when provider is "openai"'
          );
        }

        // Instantiate adapter with API key
        return new OpenAIAdapter(apiKey);
      }

      default:
        // Fail-safe: return stub for unknown providers
        return new StubAIAdapter();
    }
  },
  inject: [
    { token: AI_PROVIDER_CONFIG, optional: true },
    { token: ConfigService, optional: true }
  ]
}
```

### Configuration Validation Rules

**When provider is NOT 'openai':**
- No validation
- No error
- OpenAI adapter not instantiated

**When provider is 'openai' AND ConfigService is unavailable:**
- `configService?.get()` returns undefined
- Validation fails: `apiKey` is undefined
- Error thrown: `"OPENAI_API_KEY environment variable is required when provider is \"openai\""`

**When provider is 'openai' AND OPENAI_API_KEY is missing:**
- `configService.get('OPENAI_API_KEY')` returns undefined
- Validation fails
- Error thrown at module initialization (fail-fast)

**When provider is 'openai' AND OPENAI_API_KEY is empty string:**
- `configService.get('OPENAI_API_KEY')` returns `""`
- Validation fails: `apiKey.trim().length === 0`
- Error thrown at module initialization

**When provider is 'openai' AND OPENAI_API_KEY is whitespace:**
- `configService.get('OPENAI_API_KEY')` returns `"   "`
- Validation fails: `apiKey.trim().length === 0`
- Error thrown at module initialization

**When provider is 'openai' AND OPENAI_API_KEY is valid:**
- `configService.get('OPENAI_API_KEY')` returns valid key (e.g., `"sk-..."`)
- Validation passes
- OpenAIAdapter instantiated with API key
- Factory returns OpenAIAdapter instance

### Validation Timing

**When:** Module initialization (application bootstrap)

**Where:** AIExecutionModule provider factory

**Why:** Fail-fast approach prevents service from starting with invalid configuration

**Behavior:** If validation fails, NestJS module compilation throws error and service does not start

### Import Requirements

**Required Import:**

```typescript
import { OpenAIAdapter } from './adapters/openai-ai.adapter';
```

Add this import alongside existing adapter imports (StubAIAdapter, AnthropicAdapter).

### No Changes to DI Tokens

- AI_ADAPTER token remains unchanged (LOCKED)
- AI_PROVIDER_CONFIG token remains unchanged (LOCKED)
- ConfigService injection remains optional (LOCKED)
- No new DI tokens required

### Design Alignment

| Aspect | AnthropicAdapter (C2-K) | OpenAIAdapter (C2-I) |
|--------|------------------------|----------------------|
| Factory case | `case 'anthropic'` | `case 'openai'` |
| Env var name | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
| Validation | Fail-fast, non-empty check | Fail-fast, non-empty check |
| Error message | Provider-specific | Provider-specific |
| Instantiation | `new AnthropicAdapter(apiKey)` | `new OpenAIAdapter(apiKey)` |
| ConfigService usage | `configService?.get<string>(...)` | `configService?.get<string>(...)` |

---

## TESTING STRATEGY

### Unit Tests: OpenAIAdapter

**File:** `src/ai-execution/adapters/__tests__/openai-ai.adapter.spec.ts` (NEW)

**Test Categories:**

#### 1. Constructor Tests (8 tests)

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Valid API key | Adapter instantiates successfully |
| 2 | Undefined API key | Throws error: "OpenAI API key is required" |
| 3 | Empty string API key | Throws error: "OpenAI API key is required" |
| 4 | Whitespace-only API key | Throws error: "OpenAI API key is required" |
| 5 | No options provided | Uses default model, maxTokens, temperature |
| 6 | Custom model option | Uses custom model |
| 7 | Custom maxTokens option | Uses custom maxTokens |
| 8 | Custom temperature option | Uses custom temperature |

#### 2. execute() Success Tests (6 tests)

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 9 | Transform AIExecutionRequest to OpenAI format | Correct messages array, model, params |
| 10 | Extract text content from response | `output` = `choices[0].message.content` |
| 11 | Extract token usage from response | `tokensUsed` = `usage.total_tokens` |
| 12 | Extract model from response | `model` = `response.model` |
| 13 | Response with custom model identifier | Returns actual model from response |
| 14 | Response.model undefined | Falls back to instance model |

#### 3. execute() Error Tests (16 tests)

| # | Test Case | Expected Exception | Error Message |
|---|-----------|-------------------|---------------|
| 15 | 401 error (invalid API key) | `UnauthorizedException` | "Invalid OpenAI API key" |
| 16 | 400 error (validation error) | `BadRequestException` | "Invalid request to OpenAI API" |
| 17 | 429 error (rate limit) | `ServiceUnavailableException` | "OpenAI API rate limit exceeded" |
| 18 | 500 error (server error) | `InternalServerErrorException` | "OpenAI API server error" |
| 19 | Timeout error | `ServiceUnavailableException` | "OpenAI API timeout" |
| 20 | Network error (ECONNREFUSED) | `ServiceUnavailableException` | "OpenAI API connection error" |
| 21 | Network error (ENOTFOUND) | `ServiceUnavailableException` | "OpenAI API connection error" |
| 22 | Response missing choices | `InternalServerErrorException` | "Malformed OpenAI response: missing choices" |
| 23 | Response with empty choices array | `InternalServerErrorException` | "Malformed OpenAI response: missing choices" |
| 24 | Response content is null | `InternalServerErrorException` | "Malformed OpenAI response: missing content" |
| 25 | Response content is empty string | `InternalServerErrorException` | "Malformed OpenAI response: missing content" |
| 26 | Response missing usage | `InternalServerErrorException` | "Malformed OpenAI response: missing usage" |
| 27 | Response usage.total_tokens is null | `InternalServerErrorException` | "Malformed OpenAI response: invalid token count" |
| 28 | Response usage.total_tokens is negative | `InternalServerErrorException` | "Malformed OpenAI response: invalid token count" |
| 29 | Response usage.total_tokens is string | `InternalServerErrorException` | "Malformed OpenAI response: invalid token count" |
| 30 | Unknown error | `InternalServerErrorException` | "Unexpected error during OpenAI API call" |

**Total OpenAI Adapter Tests:** 30 tests

**Test Implementation Pattern:**

```typescript
describe('OpenAIAdapter', () => {
  describe('constructor', () => {
    it('should throw error when API key is undefined', () => {
      expect(() => new OpenAIAdapter(undefined as any)).toThrow(
        'OpenAI API key is required'
      );
    });
  });

  describe('execute()', () => {
    it('should extract text content from response', async () => {
      // Mock OpenAI client
      const mockClient = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test output' } }],
              usage: { total_tokens: 100 },
              model: 'gpt-4o'
            })
          }
        }
      };

      // Inject mock client
      const adapter = new OpenAIAdapter('sk-test-key');
      (adapter as any).client = mockClient;

      const request: AIExecutionRequest = {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        prompt: 'Test prompt'
      };

      const result = await adapter.execute(request);

      expect(result.output).toBe('Test output');
      expect(result.tokensUsed).toBe(100);
      expect(result.model).toBe('gpt-4o');
    });
  });
});
```

---

### Module Integration Tests

**File:** `src/ai-execution/__tests__/ai-execution.module.spec.ts` (MODIFY)

**Additional Test Cases for OpenAI:**

| # | Test Case | Expected Behavior |
|---|-----------|-------------------|
| 31 | Provider 'openai' with valid API key | Returns OpenAIAdapter instance |
| 32 | Provider 'openai' with missing API key | Module compilation throws error |
| 33 | Provider 'openai' with empty API key | Module compilation throws error |
| 34 | Provider 'openai' with whitespace API key | Module compilation throws error |

**Total Module Tests:** 4 new tests (added to existing module test suite)

**Test Implementation Pattern:**

```typescript
it('should provide OpenAIAdapter when provider is "openai" with valid API key', async () => {
  const config: AIProviderConfig = { provider: 'openai' };
  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'sk-test-key-123';
      return undefined;
    })
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      { provide: AI_PROVIDER_CONFIG, useValue: config },
      { provide: ConfigService, useValue: mockConfigService },
      // Factory provider implementation
    ]
  }).compile();

  const adapter = module.get<AIAdapter>(AI_ADAPTER);
  expect(adapter).toBeInstanceOf(OpenAIAdapter);
  expect(adapter.model).toBe('gpt-4o'); // Default model
});

it('should throw error when provider is "openai" and OPENAI_API_KEY is undefined', async () => {
  const config: AIProviderConfig = { provider: 'openai' };
  const mockConfigService = {
    get: jest.fn(() => undefined)
  };

  await expect(
    Test.createTestingModule({
      providers: [
        { provide: AI_PROVIDER_CONFIG, useValue: config },
        { provide: ConfigService, useValue: mockConfigService },
        // Factory provider implementation
      ]
    }).compile()
  ).rejects.toThrow('OPENAI_API_KEY environment variable is required when provider is "openai"');
});
```

---

### E2E Tests (Optional)

**File:** `test/ai-execution.e2e-spec.ts` (if exists)

**Optional Test Cases:**

| # | Test Case | Prerequisites |
|---|-----------|---------------|
| 35 | Execute real OpenAI request | Valid OPENAI_API_KEY in test environment |
| 36 | Token recording after execution | Integration with AIExecutionService |

**Note:** E2E tests may be skipped in CI if OPENAI_API_KEY is not available.

---

### Test Summary

| Test File | New Tests | Modified Tests | Total Tests |
|-----------|-----------|----------------|-------------|
| `openai-ai.adapter.spec.ts` | 30 | 0 | 30 |
| `ai-execution.module.spec.ts` | 4 | 0 | 4 (additional) |
| E2E (optional) | 2 | 0 | 2 (optional) |
| **Total** | **36** | **0** | **36** |

**Coverage Target:** 100% code coverage for OpenAIAdapter implementation

---

## IMPLEMENTATION STAGE GATE

### Entry Criteria (Before Implementation)

- [x] Design specification approved
- [ ] OpenAI SDK version confirmed (`openai@^4.0.0` or latest stable)
- [ ] No breaking changes to AIAdapter interface
- [ ] No breaking changes to factory provider pattern
- [ ] AnthropicAdapter (C2-H) remains LOCKED
- [ ] Configuration wiring pattern (C2-K) remains LOCKED

### Implementation Checklist

#### Phase 1: Dependencies

- [ ] Add `openai` package to `package.json` dependencies
  - Recommended version: `openai@^4.0.0` (or latest stable)
- [ ] Run `npm install`
- [ ] Verify package installation successful

#### Phase 2: Adapter Implementation

- [ ] Create file: `src/ai-execution/adapters/openai-ai.adapter.ts`
- [ ] Implement constructor with API key validation
- [ ] Implement `execute()` method with request mapping
- [ ] Implement `transformResponse()` private method
- [ ] Implement `handleError()` private method
- [ ] Add JSDoc comments matching AnthropicAdapter style
- [ ] Add class-level documentation header
- [ ] Verify readonly `model` property
- [ ] Verify instance-level configuration (maxTokens, temperature)

#### Phase 3: Factory Integration

- [ ] Update `src/ai-execution/ai-execution.module.ts`
- [ ] Add import: `import { OpenAIAdapter } from './adapters/openai-ai.adapter';`
- [ ] Add `case 'openai'` to factory switch statement
- [ ] Implement ConfigService resolution for `OPENAI_API_KEY`
- [ ] Add fail-fast validation for missing API key
- [ ] Verify error message format

#### Phase 4: Configuration Documentation

- [ ] Update `.env.example`
- [ ] Add `OPENAI_API_KEY` documentation
- [ ] Include link to OpenAI API key page
- [ ] Add C2-I stage marker in comment

#### Phase 5: Unit Tests

- [ ] Create file: `src/ai-execution/adapters/__tests__/openai-ai.adapter.spec.ts`
- [ ] Implement 8 constructor tests
- [ ] Implement 6 execute() success tests
- [ ] Implement 16 execute() error tests
- [ ] Mock OpenAI SDK client for deterministic testing
- [ ] Verify 100% code coverage for adapter

#### Phase 6: Module Integration Tests

- [ ] Update `src/ai-execution/__tests__/ai-execution.module.spec.ts`
- [ ] Add 4 factory provider tests for OpenAI configuration
- [ ] Test valid API key scenario
- [ ] Test missing API key error
- [ ] Test empty API key error
- [ ] Test whitespace API key error

#### Phase 7: Verification

- [ ] Run `npm test` — All tests passing
- [ ] Run `npm run build` — Build succeeds
- [ ] Boot service with StubAIAdapter (default) — No regressions
- [ ] Boot service with AnthropicAdapter — No regressions
- [ ] Boot service with OpenAIAdapter — Verify initialization logs
- [ ] Execute test request with OpenAI provider — Verify token recording

### Exit Criteria (Implementation Complete)

- [ ] All 34 tests passing (30 adapter + 4 module)
- [ ] No test failures in existing test suites
- [ ] Service boots successfully with `provider: 'openai'` and valid API key
- [ ] Token usage extracted correctly from OpenAI responses
- [ ] Error handling matches specification
- [ ] Code follows AnthropicAdapter structural patterns
- [ ] JSDoc comments complete
- [ ] Checkpoint document created: `PHASE-12B-STAGE-C2-I-CHECKPOINT.md`

---

## FILES TO CREATE / MODIFY

### Files to Create (2 new files)

1. **`src/ai-execution/adapters/openai-ai.adapter.ts`**
   - OpenAIAdapter class implementation
   - Implements AIAdapter interface
   - ~300-350 lines (similar to AnthropicAdapter)

2. **`src/ai-execution/adapters/__tests__/openai-ai.adapter.spec.ts`**
   - Unit tests for OpenAIAdapter
   - 30 test cases
   - ~400-500 lines

### Files to Modify (4 existing files)

3. **`package.json`**
   - Add `openai` to dependencies
   - 1 line change

4. **`src/ai-execution/ai-execution.module.ts`**
   - Add OpenAIAdapter import
   - Add `case 'openai'` to factory
   - ~15 lines added

5. **`src/ai-execution/__tests__/ai-execution.module.spec.ts`**
   - Add 4 test cases for OpenAI provider
   - ~60-80 lines added

6. **`.env.example`**
   - Add OPENAI_API_KEY documentation
   - ~4 lines added

### Total Impact

- **2 new files**
- **4 modified files**
- **~800-950 total lines of code/tests**

---

## ARCHITECTURE ALIGNMENT

### Structural Comparison: AnthropicAdapter vs OpenAIAdapter

| Aspect | AnthropicAdapter (C2-H) | OpenAIAdapter (C2-I) |
|--------|-------------------------|----------------------|
| **Interface** | AIAdapter | AIAdapter |
| **Constructor** | `(apiKey, options?)` | `(apiKey, options?)` |
| **API Key Validation** | Constructor-level | Constructor-level |
| **SDK** | `@anthropic-ai/sdk` | `openai` |
| **Request Format** | Anthropic Messages API | OpenAI Chat Completions API |
| **Messages Structure** | `messages: [{ role, content }]` | `messages: [{ role, content }]` |
| **Token Extraction** | `input_tokens + output_tokens` | `usage.total_tokens` |
| **Response Content** | `content[0].text` | `choices[0].message.content` |
| **Model Field** | `response.model` or fallback | `response.model` or fallback |
| **Error Handling** | Throw-only, NestJS exceptions | Throw-only, NestJS exceptions |
| **Configuration** | `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` |
| **Factory Case** | `case 'anthropic'` | `case 'openai'` |
| **Default Model** | `claude-3-5-sonnet-20241022` | `gpt-4o` |
| **Default Max Tokens** | 4096 | 4096 |
| **Default Temperature** | 1.0 | 1.0 |
| **Stateless** | Yes | Yes |
| **Deterministic** | Yes | Yes |
| **Logging** | Debug + Error | Debug + Error |

### Design Consistency

Both adapters follow identical patterns for:
- ✓ Constructor signature and validation
- ✓ Request transformation approach
- ✓ Response transformation approach
- ✓ Token extraction (both return single `tokensUsed` number)
- ✓ Error handling semantics
- ✓ Factory integration pattern
- ✓ ConfigService usage
- ✓ Test structure and coverage
- ✓ JSDoc documentation style

### Provider-Specific Differences

The only differences are provider-specific implementation details:
- SDK library used
- API request/response formats
- Token field names
- Model identifiers
- Environment variable names

All structural patterns remain consistent.

---

## SAFE RESUME POINT

### Current State (After C2-I Design)

**Stage C2-I is DESIGN ONLY — No implementation has been performed.**

This design document defines:
- ✓ Adapter responsibilities and boundaries
- ✓ Request/response mapping rules
- ✓ Token accounting strategy
- ✓ Error handling semantics
- ✓ Configuration expectations
- ✓ Factory integration design
- ✓ Test strategy
- ✓ Entry/exit criteria

### What Can Change During Implementation

During C2-I implementation, the following MAY be adjusted:
- OpenAI SDK version (use latest stable)
- Error message wording (minor adjustments for clarity)
- Test descriptions (minor wording changes)
- Private method names (implementation detail)
- Log message formatting (implementation detail)

### What MUST NOT Change

The following are **LOCKED** and cannot be modified during C2-I implementation:

**From Previous Stages:**
- AIAdapter interface (C2-A) — LOCKED
- AIExecutionRequest interface (C2-A) — LOCKED
- AIExecutionResult interface (C2-A) — LOCKED
- AIProviderConfig shape (C2-G) — LOCKED
- Factory provider pattern (C2-G) — LOCKED
- AnthropicAdapter implementation (C2-H) — LOCKED
- ConfigService wiring pattern (C2-K) — LOCKED
- AI_ADAPTER token (LOCKED)
- AI_PROVIDER_CONFIG token (LOCKED)
- StubAIAdapter default behavior (LOCKED)
- Throw-only error semantics (LOCKED)

**From This Design:**
- OpenAIAdapter class name
- Constructor signature pattern
- execute() method signature
- AIExecutionRequest → OpenAI request mapping
- OpenAI response → AIExecutionResult mapping
- Token extraction approach (use `total_tokens`)
- Error category mapping (401→Unauthorized, 429→ServiceUnavailable, etc.)
- Factory case: `case 'openai'`
- Environment variable: `OPENAI_API_KEY`
- Validation: fail-fast for missing API key

### Next Stages After C2-I

**C2-J: Groq Adapter Implementation**
- Can proceed in parallel with C2-I implementation
- Should follow same design patterns as C2-I
- Will add `case 'groq'` to factory
- Will use `GROQ_API_KEY` environment variable

**Future Stages:**
- C2-L+: Additional provider adapters
- C3: Advanced adapter features (streaming, tool use, etc.)

### Rollback Procedure

If C2-I implementation needs to be reverted:

1. Delete `src/ai-execution/adapters/openai-ai.adapter.ts`
2. Delete `src/ai-execution/adapters/__tests__/openai-ai.adapter.spec.ts`
3. Remove `openai` from `package.json`
4. Restore `ai-execution.module.ts` (remove OpenAI case from factory)
5. Restore `ai-execution.module.spec.ts` (remove OpenAI tests)
6. Restore `.env.example` (remove OPENAI_API_KEY)
7. Run: `npm install && npm test`

**Note:** Rollback returns to C2-K state (only Anthropic adapter available)

---

## OPEN QUESTIONS

### Question 1: OpenAI SDK Version

**Question:** Should we use `openai@^4.0.0` or latest stable version?

**Recommendation:** Use latest stable version (4.x branch)
- OpenAI SDK v4 is stable and widely adopted
- Uses modern TypeScript patterns
- Better type safety than v3

**Decision Required:** Confirm SDK version before implementation

---

### Question 2: Default Model Selection

**Question:** Should default model be `gpt-4o` or `gpt-4o-mini`?

**Options:**
- `gpt-4o`: Most capable multimodal model (higher cost)
- `gpt-4o-mini`: Cost-effective model (lower cost, good performance)

**Recommendation:** `gpt-4o`
- Feature parity with Anthropic's Sonnet 4.5 (most capable model)
- Consistency with AnthropicAdapter design philosophy
- Users can override via options if cost is concern

**Decision Required:** Confirm default model before implementation

---

### Question 3: Organization ID Configuration

**Question:** Should `organization` parameter be configurable via environment variable?

**Context:**
- OpenAI supports organization ID for multi-org accounts
- Not required for most use cases
- Could add `OPENAI_ORGANIZATION` environment variable

**Recommendation:** NOT for C2-I MVP
- Adds complexity without clear benefit
- Can be added in future enhancement if needed
- Constructor option already allows manual specification

**Decision Required:** Confirm scope before implementation

---

### Question 4: Future Streaming Support

**Question:** Should design consider future streaming response support?

**Context:**
- OpenAI supports streaming via `stream: true` parameter
- Would require different adapter interface (async iterator)
- Out of scope for C2-I

**Recommendation:** Design does NOT block future streaming
- Current execute() returns Promise<AIExecutionResult>
- Future: Add executeStream() method or separate adapter
- No design changes needed now

**Decision Required:** None (informational only)

---

### Question 5: Function Calling / Tool Use

**Question:** Should design consider future function calling support?

**Context:**
- OpenAI supports function calling and tool use
- Would require extending AIExecutionRequest interface
- Out of scope for C2-I

**Recommendation:** Design does NOT block future tool use
- Current design uses basic messages format
- Future: Extend AIExecutionRequest with tools field
- No design changes needed now

**Decision Required:** None (informational only)

---

## BLOCKERS

**No blockers identified.**

All dependencies and patterns are established:
- ✓ AIAdapter interface exists (C2-A)
- ✓ Factory provider pattern exists (C2-G)
- ✓ ConfigService wiring pattern exists (C2-K)
- ✓ AnthropicAdapter provides structural reference (C2-H)
- ✓ OpenAI SDK is publicly available and stable

---

## DESIGN SUMMARY

### What This Design Specifies

Stage C2-I design specification includes:

- ✓ **Adapter responsibilities**: What OpenAIAdapter does and doesn't do
- ✓ **Request mapping**: AIExecutionRequest → OpenAI Chat Completions API
- ✓ **Response mapping**: OpenAI response → AIExecutionResult
- ✓ **Token accounting**: Extract from `usage.total_tokens`
- ✓ **Error handling**: Throw-only semantics with NestJS exceptions
- ✓ **Configuration**: OPENAI_API_KEY via ConfigService
- ✓ **Factory integration**: Add `case 'openai'` with fail-fast validation
- ✓ **Test strategy**: 30 adapter tests + 4 module tests
- ✓ **Entry/exit criteria**: Implementation stage gate
- ✓ **Architecture alignment**: Structural consistency with AnthropicAdapter

### What This Design Does NOT Specify

The following are explicitly out of scope:

- ❌ Streaming responses
- ❌ Function calling / tool use
- ❌ Vision/image inputs
- ❌ Multi-turn conversation management
- ❌ Token recording/billing logic
- ❌ Retry logic
- ❌ Rate limiting
- ❌ Response caching
- ❌ Changes to AIAdapter interface
- ❌ Changes to existing adapters

### Implementation Readiness

**This design is READY FOR IMPLEMENTATION** pending:
- [ ] Design approval
- [ ] OpenAI SDK version confirmation
- [ ] Default model confirmation

**Estimated Implementation Effort:**
- 2 new files (~700-850 lines)
- 4 modified files (~80-100 lines added)
- Total: ~800-950 lines of code and tests

**Risk Assessment:** LOW
- Follows established patterns from C2-H and C2-K
- No architectural changes required
- No interface changes required
- Clear test strategy with high coverage

---

## CHECKPOINT METADATA

**Stage:** C2-I

**Type:** DESIGN SPECIFICATION

**Status:** DESIGN COMPLETE, AWAITING IMPLEMENTATION

**Dependencies:**
- C2-A: Interface contracts (LOCKED)
- C2-G: Factory provider pattern (LOCKED)
- C2-H: AnthropicAdapter reference (LOCKED)
- C2-K: ConfigService wiring pattern (LOCKED)

**Deliverable:** This design document

**Next Step:** Implementation of OpenAIAdapter following this specification

**Parallel Work:** C2-J (Groq Adapter) can proceed with similar design pattern

---

**END OF DESIGN SPECIFICATION**

This document defines the complete design for Stage C2-I. Implementation should follow this specification exactly, with adjustments only for minor implementation details (private method names, log formatting, etc.).

All locked invariants from previous stages must be preserved. Any deviations from this design must be documented and approved.
