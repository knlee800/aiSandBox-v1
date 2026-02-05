# PHASE 12B — STAGE C2-F CHECKPOINT

**Real Adapter Architecture — Design Lock**

---

## Checkpoint Metadata

| Property | Value |
|----------|-------|
| **Phase** | 12B |
| **Stage** | C2-F |
| **Status** | ✅ COMPLETE (DESIGN-ONLY) |
| **Date** | 2026-02-02 |
| **Type** | Design Freeze + Safe Resume Point |
| **Scope** | Architecture specification lock — NO code changes |

---

## 1. Phase Overview

Phase 12B addresses the integration of real AI providers (Anthropic, OpenAI, Groq) into the `ai-service` execution pipeline. This phase replaces the stub-based execution model with a production-ready, multi-provider adapter architecture.

**Stage C2-F** represents the **corrected design specification** for the adapter architecture after identifying critical flaws in the initial C2 design. This checkpoint locks the architecture and serves as the authoritative reference for implementation stages C2-G through C2-J.

### Context

Previous stages (C2-A through C2-E) established:
- Stub-based baseline execution flow
- AI execution domain boundaries
- Error propagation patterns
- Token usage tracking hooks

Stage C2-F corrects and finalizes the adapter design before implementation begins.

---

## 2. What Was Designed (C2-F)

Stage C2-F produced the following artifacts:

### 2.1 Architecture Specification
- Factory-provider based adapter selection mechanism
- Token-based dependency injection strategy
- Error handling contract (throw-only semantics)
- Token accounting verification strategy
- Testing isolation requirements

### 2.2 Design Corrections
- **Removed**: `AIExecutionModule.forRoot()` pattern
- **Removed**: Mixed throw/return error semantics
- **Removed**: Error payload return values from adapters
- **Added**: Explicit verification requirements for token recording
- **Added**: Fallback strategy for missing billing integration

### 2.3 Staged Rollout Plan
- **C2-G**: Anthropic adapter implementation
- **C2-H**: OpenAI adapter implementation
- **C2-I**: Groq adapter implementation
- **C2-J**: Provider selection logic + configuration

### 2.4 Risk Analysis
- Billing integration assumptions identified as HIGH RISK
- Testing isolation requirements formalized
- Stub safety guarantees locked
- Token accounting verification made mandatory

---

## 3. Corrected Architecture Decisions

### 3.1 Adapter Selection Mechanism

**Decision**: Use factory provider pattern with `AI_ADAPTER` injection token.

**Rationale**:
- NestJS modules should remain stateless and reusable
- Configuration should be injectable, not compile-time
- `forRoot()` pattern creates module coupling
- Factory providers enable clean testing isolation

**Structure**:
```
AIExecutionModule (static module definition)
  ↓
  providers: [
    {
      provide: AI_ADAPTER,
      useFactory: (config) => selectAdapter(config),
      inject: [AI_PROVIDER_CONFIG]  // future token
    }
  ]
```

**Current State**:
- Module currently provides `StubAIAdapter` directly
- Factory provider will be introduced in C2-J after all adapters exist

### 3.2 Dependency Injection Strategy

**Locked Tokens**:

| Token | Purpose | Status |
|-------|---------|--------|
| `AI_ADAPTER` | Abstract adapter interface | ✅ Exists (currently bound to stub) |
| `AI_PROVIDER_CONFIG` | Provider selection config | 🔮 Future (C2-J) |

**Injection Pattern**:
```typescript
// Services inject the abstract interface
constructor(@Inject(AI_ADAPTER) private adapter: AIAdapter) {}
```

**Configuration Pattern** (C2-J):
```typescript
// Factory selects concrete adapter based on config
useFactory: (config: AIProviderConfig) => {
  switch (config.provider) {
    case 'anthropic': return new AnthropicAdapter(config);
    case 'openai': return new OpenAIAdapter(config);
    case 'groq': return new GroqAdapter(config);
    default: return new StubAIAdapter();
  }
}
```

### 3.3 Error Handling Contract

**LOCKED SEMANTICS**:

✅ **All adapters MUST throw on failure**
✅ **AIExecutionResult represents SUCCESS ONLY**
❌ **NO error payloads in result objects**
❌ **NO mixed throw/return behavior**

**Failure Categories**:
1. **Network errors** → throw `Error`
2. **API errors** → throw `Error` (with provider error context)
3. **Validation errors** → throw `Error`
4. **Rate limits** → throw `Error`
5. **Configuration errors** → throw `Error`

**Caller Responsibility**:
- All callers MUST wrap adapter calls in try/catch
- Error handling occurs at service layer
- HTTP errors propagate via NestJS exception filters

**Rationale**:
- Explicit failure propagation
- No ambiguity about success state
- Follows NestJS exception handling patterns
- Simplifies testing (no error payload assertions)

---

## 4. Locked Invariants

These invariants are **IMMUTABLE** unless explicitly unlocked by future design review.

### 4.1 Adapter Interface Contract

```typescript
interface AIAdapter {
  execute(request: AIExecutionRequest): Promise<AIExecutionResult>;
}

interface AIExecutionResult {
  output: string;
  tokensUsed: number;  // MUST be accurate for billing
  provider: string;
}
```

**Guarantees**:
- Method returns ONLY on success
- Method throws on ALL failures
- Result object NEVER contains error information
- `tokensUsed` MUST reflect actual provider usage

### 4.2 Stub Adapter Behavior

**StubAIAdapter remains the default and MUST**:
- Make ZERO external API calls
- Return `tokensUsed: 0` (prevents billing)
- Work with NO environment variables
- Return deterministic stub output
- NEVER throw (represents graceful degradation)

**Purpose**:
- Safe default for environments without provider credentials
- Testing baseline
- Development workflow without API costs

### 4.3 Module Structure

**LOCKED**:
- `AIExecutionModule` remains a static module
- NO `forRoot()` method
- NO `forRootAsync()` method
- Configuration injected via providers, not module registration

**Rationale**:
- Maintains module reusability
- Simplifies testing imports
- Avoids module coupling

### 4.4 Provider Implementation Independence

**Each adapter (Anthropic, OpenAI, Groq) MUST**:
- Be independently testable
- Have NO cross-dependencies
- Use provider-specific SDKs directly
- Map provider responses to unified `AIExecutionResult` schema

**Forbidden**:
- Shared adapter base class (premature abstraction)
- Cross-adapter utility functions
- Provider detection logic in adapters

---

## 5. Error Handling Contract (Throw-Only)

### 5.1 Adapter Exception Behavior

**ALL adapters MUST**:
- Throw exceptions for ANY failure
- Include provider context in error messages
- Preserve original error stack traces
- Use standard Error class (no custom exception types yet)

### 5.2 Service Layer Handling

**`AIExecutionService` MUST**:
- Wrap all `adapter.execute()` calls in try/catch
- Transform thrown errors into HTTP exceptions
- Log errors with provider context
- Propagate sanitized errors to API Gateway

### 5.3 Error Propagation Chain

```
Adapter throws Error
  ↓
AIExecutionService catches
  ↓
Service logs error
  ↓
Service throws HttpException (NestJS)
  ↓
Exception filter handles HTTP response
  ↓
API Gateway receives 4xx/5xx response
```

### 5.4 NO Error Payloads

**Explicitly FORBIDDEN**:
```typescript
// ❌ WRONG
return {
  output: '[ERROR] API call failed',
  tokensUsed: 0,
  provider: 'anthropic'
};

// ✅ CORRECT
throw new Error('Anthropic API call failed: rate limit exceeded');
```

---

## 6. Token & Cost Accounting Strategy

### 6.1 Token Recording Requirement

**CRITICAL**: Token usage MUST be recorded for billing accuracy.

**Current Assumption**:
- `AIExecutionService` has a `recordTokenUsage()` method
- Method accepts session context and token count
- Method integrates with billing system

**⚠️ VERIFICATION REQUIRED**:
- Method existence MUST be verified before C2-G implementation
- Method signature MUST be confirmed
- Billing integration MUST be tested

### 6.2 Verification Strategy

**Before implementing ANY real adapter**:

1. **Locate Method**:
   ```bash
   grep -r "recordTokenUsage" aiSandBox/services/ai-service/
   ```

2. **Verify Signature**:
   ```typescript
   // Expected pattern
   async recordTokenUsage(sessionId: string, tokens: number): Promise<void>
   ```

3. **Trace Integration**:
   - Find database writes
   - Find billing service calls
   - Verify transaction safety

### 6.3 Fallback Plan

**If `recordTokenUsage()` does NOT exist**:

**Option A**: Add stub method immediately
```typescript
async recordTokenUsage(sessionId: string, tokens: number): Promise<void> {
  this.logger.warn(`Token recording not implemented: ${tokens} tokens`);
}
```

**Option B**: Gate adapter usage until billing ready
- Block real adapter usage in production
- Allow only stub adapter until method implemented
- Document billing integration as blocking dependency

**Option C**: Implement minimal billing hook
- Add database write for token usage
- Defer cost calculation to separate service
- Log usage for manual reconciliation

**DECISION REQUIRED**: Choose fallback before C2-G.

### 6.4 Accounting Invariants

**For ALL adapters**:
- `tokensUsed` MUST reflect provider's actual usage
- Token count MUST be extracted from provider response
- Token recording MUST occur BEFORE returning result
- Failed calls MUST NOT record tokens (throw occurs first)

**Example Flow**:
```
1. Adapter calls provider API
2. Provider returns response with usage metadata
3. Adapter extracts token count
4. Adapter returns AIExecutionResult with tokens
5. Service calls recordTokenUsage(sessionId, result.tokensUsed)
6. Service returns result to caller
```

---

## 7. Testing Strategy & Infrastructure Isolation

### 7.1 Testing Requirements

**Unit Tests** (`*.spec.ts`):
- MUST run with NO external dependencies
- MUST mock all adapters
- MUST NOT require PostgreSQL
- MUST NOT require Redis
- MUST NOT require Docker

**Integration Tests** (`*.integration.spec.ts`):
- MUST use stub adapter by default
- MUST mock provider APIs
- MUST NOT make real API calls
- MUST NOT require api-gateway
- MAY use in-memory database for service tests

**E2E Tests** (`*.e2e-spec.ts`):
- Explicitly GATED by environment variables
- Require provider API keys
- Require full infrastructure (postgres, redis)
- Skipped in CI by default
- Documented as manual-only tests

### 7.2 Adapter Testing Isolation

**Each adapter MUST have**:

1. **Unit tests with mocked SDK**:
   ```typescript
   // Mock provider SDK responses
   jest.mock('@anthropic-ai/sdk');
   ```

2. **Integration tests with stub provider**:
   ```typescript
   // Stub provider API responses
   nock('https://api.anthropic.com').post().reply(200, {...});
   ```

3. **E2E tests with real API (gated)**:
   ```typescript
   describe('AnthropicAdapter E2E', () => {
     beforeAll(() => {
       if (!process.env.ANTHROPIC_API_KEY) {
         console.log('Skipping E2E tests: no API key');
         return;
       }
     });
   });
   ```

### 7.3 Service Testing Strategy

**AIExecutionService tests MUST**:
- Use stub adapter for all tests
- Mock token recording method
- Test error handling without real failures
- Verify exception propagation

**FORBIDDEN in service tests**:
- Real provider API calls
- Real adapter instances
- Environment variable requirements
- External service dependencies

---

## 8. Staged Rollout Plan (C2-G → C2-J)

### 8.1 Stage C2-G: Anthropic Adapter

**Scope**:
- Implement `AnthropicAdapter` class
- Integrate `@anthropic-ai/sdk`
- Map Anthropic responses to `AIExecutionResult`
- Extract token usage from Anthropic response metadata
- Add unit + integration tests
- Add E2E test (gated by env var)

**Verification**:
- Token usage matches Anthropic dashboard
- Error handling follows throw-only contract
- Adapter works in isolation (no service changes)

**Rollout**:
- Adapter exists but NOT used by default
- Stub adapter remains default
- Manual testing with explicit adapter injection

### 8.2 Stage C2-H: OpenAI Adapter

**Scope**:
- Implement `OpenAIAdapter` class
- Integrate `openai` SDK
- Map OpenAI responses to `AIExecutionResult`
- Extract token usage from OpenAI response
- Add unit + integration tests
- Add E2E test (gated by env var)

**Verification**:
- Token usage matches OpenAI dashboard
- Error handling follows throw-only contract
- Adapter works independently of Anthropic adapter

**Rollout**:
- Adapter exists but NOT used by default
- Stub adapter remains default
- Manual testing with explicit adapter injection

### 8.3 Stage C2-I: Groq Adapter

**Scope**:
- Implement `GroqAdapter` class
- Integrate Groq SDK (or HTTP client)
- Map Groq responses to `AIExecutionResult`
- Extract token usage from Groq response
- Add unit + integration tests
- Add E2E test (gated by env var)

**Verification**:
- Token usage matches Groq dashboard
- Error handling follows throw-only contract
- Adapter works independently of other adapters

**Rollout**:
- Adapter exists but NOT used by default
- Stub adapter remains default
- Manual testing with explicit adapter injection

### 8.4 Stage C2-J: Provider Selection Logic

**Scope**:
- Define `AI_PROVIDER_CONFIG` injection token
- Implement factory provider for `AI_ADAPTER` token
- Add provider selection logic (switch statement)
- Add configuration validation
- Update module to use factory provider
- Add integration tests for provider switching

**Configuration Schema**:
```typescript
interface AIProviderConfig {
  provider: 'stub' | 'anthropic' | 'openai' | 'groq';
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}
```

**Default Behavior**:
- Provider defaults to `'stub'`
- Missing API key → fallback to stub
- Invalid provider → fallback to stub

**Verification**:
- Each provider selectable via config
- Stub remains default
- Missing credentials gracefully degrade to stub

**Rollout**:
- Configuration injected via environment variables
- Production uses real provider
- Development/testing uses stub by default

### 8.5 Rollout Sequencing

**Phase 1** (C2-G): Anthropic only
- Single provider implementation
- Prove adapter pattern works
- Validate token accounting

**Phase 2** (C2-H + C2-I): Multi-provider
- Demonstrate adapter independence
- Confirm unified interface works
- Stress-test error handling

**Phase 3** (C2-J): Dynamic selection
- Enable runtime provider switching
- Complete configuration system
- Production readiness

---

## 9. Explicit Non-Goals

These items are **OUT OF SCOPE** for Phase 12B and MUST NOT be implemented without explicit approval.

### 9.1 NOT Implementing

❌ **Streaming responses**
- Current scope: synchronous execution only
- Streaming requires protocol changes
- Deferred to future phase

❌ **Multi-turn conversations**
- Current scope: single-shot execution
- Conversation state requires session management
- Deferred to future phase

❌ **Provider fallback logic**
- Current scope: single provider per request
- Fallback adds complexity
- Deferred to future phase

❌ **Cost optimization strategies**
- Current scope: accurate accounting only
- Optimization requires analytics
- Deferred to future phase

❌ **Custom exception hierarchy**
- Current scope: standard Error class
- Custom exceptions add overhead
- Deferred until error patterns emerge

❌ **Adapter base class**
- Current scope: independent implementations
- Base class is premature abstraction
- Deferred until shared patterns identified

❌ **Provider-agnostic prompt templates**
- Current scope: pass-through execution
- Prompt engineering is application layer concern
- Deferred to future phase

❌ **Retry logic**
- Current scope: throw on first failure
- Retry requires policy decisions
- Deferred to future phase

❌ **Circuit breakers**
- Current scope: no failure tolerance
- Circuit breakers require metrics
- Deferred to future phase

❌ **Provider health checks**
- Current scope: fail on demand
- Health checks require monitoring infrastructure
- Deferred to future phase

---

## 10. Risks & Guardrails

### 10.1 High-Risk Areas

#### Risk 1: Token Recording Method Does Not Exist
**Likelihood**: Medium
**Impact**: HIGH (blocks billing accuracy)

**Mitigation**:
- Verify method existence BEFORE implementing C2-G
- Document fallback plan (stub method or gate usage)
- Add TODO comment if method missing

**Detection**:
```bash
grep -r "recordTokenUsage" aiSandBox/services/ai-service/src/
```

#### Risk 2: Provider Token Metadata Inconsistent
**Likelihood**: High
**Impact**: MEDIUM (inaccurate billing)

**Mitigation**:
- Validate token extraction against provider docs
- Add E2E tests comparing reported vs. dashboard usage
- Log token metadata for manual verification

**Detection**:
- Compare `result.tokensUsed` to provider dashboard
- Check for zero-token successful responses
- Monitor for negative token counts

#### Risk 3: Adapter Throws in Unexpected Places
**Likelihood**: Medium
**Impact**: MEDIUM (service crashes)

**Mitigation**:
- Comprehensive try/catch in service layer
- Log all exceptions with provider context
- Add global exception filter

**Detection**:
- Monitor for unhandled promise rejections
- Check for 500 errors in logs
- Test all error paths in integration tests

#### Risk 4: Test Isolation Breaks
**Likelihood**: Low
**Impact**: HIGH (CI failures, slow tests)

**Mitigation**:
- Enforce NO_ENV test mode
- Mock all external dependencies
- Gate E2E tests explicitly

**Detection**:
- CI runs fail with "connection refused"
- Tests require environment setup
- Tests fail in parallel execution

### 10.2 Guardrails

**Mandatory Code Review Checks**:
- [ ] No `forRoot()` pattern introduced
- [ ] All adapters throw on failure
- [ ] No error payloads in results
- [ ] Token recording verified before merge
- [ ] E2E tests gated by environment
- [ ] Stub adapter remains default

**Automated Checks** (future):
- Lint rule: no `return { output: '[ERROR]' }`
- Test coverage: all adapters >80%
- Integration test: no real API calls
- Build check: no missing env vars required

**Rollback Triggers**:
- Token usage deviates >10% from provider dashboard
- Adapter throws in more than 5% of requests
- Tests require external dependencies
- Production uses non-stub adapter without explicit config

---

## 11. Safe Resume Point

This checkpoint represents a **SAFE RESUME POINT** for implementation.

### 11.1 What Is Locked

✅ **Architecture**: Factory-provider adapter selection
✅ **Error Contract**: Throw-only, no error payloads
✅ **Interface**: `AIAdapter.execute()` signature
✅ **Testing Strategy**: Isolated unit/integration, gated E2E
✅ **Rollout Plan**: C2-G → C2-H → C2-I → C2-J
✅ **Non-Goals**: Streaming, multi-turn, fallback, retry

### 11.2 What Requires Verification

⚠️ **Token Recording**: Method existence and signature
⚠️ **Billing Integration**: Database writes and service calls
⚠️ **Provider SDKs**: Token metadata extraction patterns

### 11.3 Next Actions

**Immediate** (before C2-G):
1. Verify `recordTokenUsage()` method existence
2. Document method signature if found
3. Choose fallback plan if NOT found
4. Update design doc with verification results

**Implementation** (C2-G start):
1. Create `anthropic.adapter.ts`
2. Implement `execute()` method
3. Extract token usage from Anthropic response
4. Add unit tests with mocked SDK
5. Add integration tests with stubbed API
6. Add gated E2E test
7. Document token extraction logic

**Validation** (C2-G end):
1. Compare token usage to Anthropic dashboard
2. Test error handling (network, API, validation)
3. Verify no error payloads returned
4. Confirm stub remains default
5. Run full test suite (unit + integration only)

---

## 12. Verification Checklist

Before proceeding to C2-G, confirm:

### 12.1 Design Lock Verification

- [ ] This checkpoint file exists at `aiSandBox/docs/PHASE-12B-STAGE-C2-F-CHECKPOINT.md`
- [ ] All sections 1-12 are complete
- [ ] All invariants are explicitly stated
- [ ] All non-goals are explicitly listed
- [ ] All risks have mitigation strategies

### 12.2 Architecture Understanding

- [ ] Factory-provider pattern understood
- [ ] `AI_ADAPTER` token purpose clear
- [ ] Error handling contract (throw-only) clear
- [ ] Token accounting strategy understood
- [ ] Testing isolation requirements clear

### 12.3 Pre-Implementation Tasks

- [ ] `recordTokenUsage()` method verified (or fallback chosen)
- [ ] Anthropic SDK documentation reviewed
- [ ] Token extraction pattern documented
- [ ] Test structure planned
- [ ] E2E gating mechanism decided

### 12.4 Rollout Readiness

- [ ] Staged plan (C2-G → C2-J) understood
- [ ] Verification steps for each stage defined
- [ ] Rollback triggers identified
- [ ] Guardrails documented
- [ ] Code review checklist prepared

---

## Document Status

**Authoritative**: YES
**Frozen**: YES
**Safe for Implementation**: YES (after verification tasks)

**Last Updated**: 2026-02-02
**Next Review**: After C2-J completion
**Supersedes**: Initial C2 design notes (2026-01-XX)

---

## Approval

This design checkpoint is **LOCKED** and serves as the authoritative specification for Phase 12B adapter architecture implementation.

**Design Authority**: AI Sandbox Platform Architecture Team
**Implementation Owner**: ai-service development team
**Checkpoint Date**: 2026-02-02

---

**END OF CHECKPOINT**
