# Stage C2-F Design Spec: Real AI Adapter Architecture

**Status:** DESIGN ONLY (No Implementation)
**Date:** 2026-02-02
**Purpose:** Architecture plan for real AI provider integration
**Scope:** Anthropic Claude adapter (primary), extensible to other providers

---

## 1. Adapter Implementation Design

### 1.1 Planned Adapters

**Primary:**
- `AnthropicClaudeAdapter` - Production adapter using Anthropic SDK
- `StubAIAdapter` - Retained as fallback/testing adapter

**Future Extensions:**
- `OpenAIAdapter` - GPT-4/GPT-3.5 support (extensibility proof)
- `MockAIAdapter` - Enhanced testing adapter with configurable responses

### 1.2 Adapter Selection Strategy

**Mechanism:** Environment-based DI binding in `AIExecutionModule`

**Binding Logic (pseudo-design):**
```
IF environment === 'production' AND ANTHROPIC_API_KEY present:
  bind AI_ADAPTER → AnthropicClaudeAdapter
ELSE IF environment === 'test':
  bind AI_ADAPTER → MockAIAdapter
ELSE:
  bind AI_ADAPTER → StubAIAdapter (safe fallback)
```

**Benefits:**
- Single configuration point (module providers)
- No service-layer changes required
- Adapter swap via environment/config only
- Fail-safe default (StubAIAdapter)

### 1.3 Model Representation

**Design:**
- `adapter.model` property returns provider-specific identifier
- AnthropicClaudeAdapter: `'claude-sonnet-4-20250514'` (versioned)
- StubAIAdapter: `'stub'` (unchanged)
- OpenAIAdapter: `'gpt-4-turbo'` (future)

**Rationale:**
- Model string returned in AIExecutionResult enables caller identification
- Versioned model names support provider upgrades
- Model-agnostic service layer (no branching logic)

### 1.4 Extensibility Pattern

**Adding New Providers (future):**
1. Create new adapter class implementing AIAdapter
2. Add provider-specific configuration interface
3. Register in module providers with conditional binding
4. Zero changes to AIExecutionService

**Example Structure:**
```
adapters/
  ai-adapter.interface.ts (locked)
  stub-ai.adapter.ts (locked)
  anthropic-claude.adapter.ts (C2-I)
  openai.adapter.ts (future)
  mock-ai.adapter.ts (C2-H)
```

---

## 2. Configuration Strategy

### 2.1 Configuration Object Design

**Proposed Interface:**
```typescript
interface AIProviderConfig {
  provider: 'anthropic' | 'openai' | 'stub';
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}
```

**Sources (priority order):**
1. Environment variables (production/dev)
2. NestJS ConfigModule (future integration)
3. Default values (safe fallback)

### 2.2 Environment Variables Design

**Required Variables:**
- `AI_PROVIDER` - Provider selection ('anthropic' | 'openai' | 'stub')
- `ANTHROPIC_API_KEY` - Anthropic API key (when provider=anthropic)
- `OPENAI_API_KEY` - OpenAI API key (when provider=openai)

**Optional Variables:**
- `AI_MODEL` - Override default model
- `AI_MAX_TOKENS` - Override default max tokens
- `AI_TEMPERATURE` - Override default temperature
- `AI_TIMEOUT_MS` - Override default timeout

**Environment-Specific Defaults:**
- Development: AI_PROVIDER=stub (safe default)
- Test: AI_PROVIDER=mock (test harness)
- Production: AI_PROVIDER=anthropic (explicit required)

### 2.3 Configuration Loading Strategy

**Stage C2-G Design:**
- Config loaded in adapter constructor (fail-fast validation)
- Missing required config throws at boot time
- Adapter logs sanitized config (NO secrets logged)

**Stage C2-J Design (future):**
- Integrate NestJS ConfigModule
- Centralized config validation with class-validator
- Config schema versioning

### 2.4 Secret Management

**Design Rules:**
- API keys NEVER logged
- Sanitized config logs: `{ provider: 'anthropic', model: 'claude-sonnet-4', apiKey: '***REDACTED***' }`
- Test environments use dummy keys: `test_key_12345`
- Production requires real keys (validation at boot)

---

## 3. Error Handling Strategy

### 3.1 Error Classification

**Adapter Errors:**

**Retryable Errors (5xx-class):**
- Provider rate limits (429)
- Provider service errors (500, 502, 503)
- Network timeouts
- Transient connection failures

**Non-Retryable Errors (4xx-class):**
- Invalid API key (401)
- Model not found (404)
- Malformed request (400)
- Quota exceeded at provider (402, 429 with quota)
- Token limit exceeded (400 with specific message)

**Design Decision:** AIExecutionService does NOT retry. Retry logic belongs in calling layer (MessagesService) if needed.

### 3.2 Error Response Design

**Adapter Behavior:**
- Adapter catches provider SDK errors
- Maps to standard error types
- Throws typed exceptions

**Proposed Error Types:**
```typescript
class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {}
}

class AIProviderRateLimitError extends AIProviderError {}
class AIProviderAuthError extends AIProviderError {}
class AIProviderQuotaError extends AIProviderError {}
```

**AIExecutionService Behavior:**
- Propagates adapter errors unchanged
- Logs error with context (sessionId, conversationId, provider, model)
- NO error transformation (keeps stack trace intact)

### 3.3 Logging Requirements

**Success Logs:**
```
[AIExecutionService] Execution success: session=abc123, model=claude-sonnet-4, tokensUsed=1234, duration=2.5s
```

**Error Logs:**
```
[AIExecutionService] Execution failed: session=abc123, provider=anthropic, error=AIProviderRateLimitError, retryable=true
```

**Sanitization Rules:**
- NEVER log API keys
- NEVER log full prompts (log length only)
- NEVER log full responses (log length only)
- DO log sessionId, conversationId, userId (for tracing)

---

## 4. Token & Cost Accounting Strategy

### 4.1 Token Counting Source

**Design:**
- Use provider SDK response `usage` field (authoritative)
- AnthropicClaudeAdapter: `response.usage.input_tokens`, `response.usage.output_tokens`
- OpenAIAdapter: `response.usage.prompt_tokens`, `response.usage.completion_tokens`
- StubAIAdapter: Returns 0 tokens (unchanged)

**Mapping:**
```typescript
AIExecutionResult.tokensUsed = inputTokens + outputTokens
```

### 4.2 Recording Strategy

**Current State:**
- api-gateway has `POST /api/internal/token-usage/record` endpoint
- ai-service already has `ApiGatewayHttpClient.recordTokenUsage()`
- QuotaService checks quota before execution

**Stage C2-I Integration Design:**
1. AIExecutionService calls adapter.execute()
2. Adapter returns AIExecutionResult with tokensUsed
3. AIExecutionService returns result to caller
4. **Caller (MessagesService)** records usage via ApiGatewayHttpClient

**Responsibility:**
- Adapter: Accurate token extraction from provider response
- AIExecutionService: Transparent pass-through
- MessagesService: Usage recording (existing pattern)

**Rationale:** Keeps AIExecutionService provider-agnostic, follows existing architecture

### 4.3 Testing Without Real Models

**Strategy:**
- Unit tests: Mock adapter returns fixed tokensUsed value
- Integration tests: Use MockAIAdapter with configurable responses
- E2E tests: Gated behind `RUN_REAL_AI_TESTS=true` environment flag

**MockAIAdapter Design (C2-H):**
```typescript
class MockAIAdapter implements AIAdapter {
  readonly model = 'mock';

  constructor(private config: MockConfig) {}

  async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
    return {
      output: this.config.mockResponse || 'Mock response',
      tokensUsed: this.config.mockTokens || 100,
      model: this.model,
    };
  }
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests (per adapter)

**AnthropicClaudeAdapter Tests (C2-I):**
- Constructor validation (throws if missing API key)
- Successful execution with mocked SDK response
- Error handling (rate limit, auth error, network error)
- Token extraction from provider response
- Timeout handling

**Mocking Approach:**
- Mock `@anthropic-ai/sdk` client methods
- Inject mock via constructor or module override
- No real API calls in unit tests

### 5.2 Integration Tests (AIExecutionService + Adapter)

**Test Scenarios:**
- Service resolves correct adapter from DI
- Delegation to adapter works
- Error propagation from adapter to service
- Token accounting accuracy

**Mocking Approach:**
- Use MockAIAdapter in test module
- Configure mock responses per test
- Verify AIExecutionResult structure

### 5.3 E2E Tests (Real Provider Calls)

**Gating Strategy:**
```typescript
describe('Real Anthropic Integration', () => {
  beforeAll(() => {
    if (!process.env.RUN_REAL_AI_TESTS) {
      test.skip('Skipped: Set RUN_REAL_AI_TESTS=true to run');
    }
  });

  // Real API call tests
});
```

**Test Requirements:**
- Real API key required
- CI/CD pipeline skips by default
- Manual trigger for integration validation
- Cost-conscious (minimal test prompts)

### 5.4 Test Coverage Goals

- Unit tests: 90%+ coverage on adapters
- Integration tests: All error paths covered
- E2E tests: Smoke tests only (1-2 scenarios)

---

## 6. Security & Compliance Design

### 6.1 API Key Security

**Design Rules:**
- API keys stored in environment variables (not code)
- Production keys managed via secrets manager (future: AWS Secrets Manager, Vault)
- Development uses dummy keys or personal dev keys
- Keys NEVER committed to version control
- Keys NEVER logged

### 6.2 Prompt & Response Handling

**Data Sensitivity:**
- User prompts may contain PII/sensitive data
- AI responses may echo sensitive data
- Logs must not expose full content

**Design:**
- Log prompt/response length, NOT content
- Optionally log first 50 chars (if non-sensitive context)
- Full content only in structured logs with retention policies

### 6.3 Rate Limiting & Abuse Prevention

**Design (future stage):**
- Quota enforcement at QuotaService (already exists)
- Provider rate limits handled by adapter error classification
- Retry logic with exponential backoff (MessagesService responsibility)

---

