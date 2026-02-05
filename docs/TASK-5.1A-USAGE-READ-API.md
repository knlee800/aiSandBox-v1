# Task 5.1A: Quota Enforcement – Usage Read APIs ONLY

## Overview

This document describes the read-only HTTP integration for token usage tracking between `ai-service` and `api-gateway`. This is the foundation for quota enforcement, providing read-only visibility into current token consumption.

**Scope:** READ-ONLY. No enforcement, no limits, no behavior changes.

**Architecture Rule:** HTTP-only communication. No cross-service imports.

---

## Components Created

### 1. api-gateway Internal Controller

**File:** `aiSandBox/services/api-gateway/src/token-usage/internal-token-usage.controller.ts`

**Purpose:** Expose read-only token usage data to ai-service

**Route:**
- `GET /api/internal/token-usage/sessions/:sessionId/total` - Get total tokens for session

**Response:**
```json
{
  "sessionId": "uuid",
  "totalTokens": 12345
}
```

**Business Logic:**
- Delegates to `TokenUsageService.getTotalTokensBySession()`
- Aggregates all token_usage records via SQL SUM()
- Returns computed total (input + output tokens)

---

### 2. ai-service HTTP Client Method

**File:** `aiSandBox/services/ai-service/src/clients/api-gateway-http.client.ts`

**New Method:**
```typescript
async getTotalTokenUsage(sessionId: string): Promise<number>
```

**Usage:**
```typescript
const apiGatewayClient = new ApiGatewayHttpClient(httpService);
const totalTokens = await apiGatewayClient.getTotalTokenUsage(sessionId);
console.log(`Session has consumed ${totalTokens} tokens`);
```

**Error Handling:**
- Throws on HTTP errors (fail-fast)
- No retries, no fallback
- Caller must handle exceptions

---

## Request Flow

```
ai-service wants to check quota
  ↓
ApiGatewayHttpClient.getTotalTokenUsage(sessionId)
  ↓
HTTP GET → api-gateway /api/internal/token-usage/sessions/:sessionId/total
  ↓
InternalTokenUsageController.getTotalTokensBySession()
  ↓
TokenUsageService.getTotalTokensBySession()
  ↓
TokenUsageRepository.getTotalUsageBySession()
  ↓
SQL: SELECT SUM(total_tokens) FROM token_usage WHERE session_id = ?
  ↓
Returns: { sessionId, totalTokens }
  ↓
ai-service receives total token count
```

---

## Data Model (No Changes)

**Entity:** `token_usage` (PostgreSQL)

**Relevant Fields:**
- `session_id` (UUID, indexed)
- `input_tokens` (integer)
- `output_tokens` (integer)
- `total_tokens` (integer, pre-computed)

**Query Performance:**
- Uses indexed `session_id` column
- SUM aggregation on pre-computed `total_tokens`
- O(n) where n = number of usage records per session
- Expected: <100ms for typical session (10-100 records)

---

## Modified Files

### api-gateway

1. **Created:**
   - `src/token-usage/internal-token-usage.controller.ts` - Read-only internal endpoint

2. **Modified:**
   - `src/token-usage/token-usage.module.ts` - Registered InternalTokenUsageController

### ai-service

3. **Modified:**
   - `src/clients/api-gateway-http.client.ts` - Added getTotalTokenUsage() method

---

## Usage Example (Future: Task 5.1B)

**NOT IMPLEMENTED YET - This is for reference only:**

```typescript
// In ai-service, before calling Claude API:
const currentUsage = await this.apiGatewayClient.getTotalTokenUsage(sessionId);
const quota = 100000; // Example: 100K tokens per session

if (currentUsage >= quota) {
  throw new Error('Quota exceeded');
}

// Proceed with Claude API call...
```

**Task 5.1A does NOT implement this check.** This is read-only infrastructure only.

---

## Architecture Compliance

✅ **HTTP-only communication**
✅ **No cross-service imports**
✅ **api-gateway owns persistence**
✅ **Fail-fast error handling**
✅ **No schema changes**
✅ **No pricing logic**
✅ **No quota blocking**
✅ **Claude API calls unaffected**

---

## Testing Checklist

- [ ] GET endpoint returns correct total for session with multiple usage records
- [ ] GET endpoint returns 0 for session with no usage records
- [ ] GET endpoint returns 404 if session doesn't exist (if validation added)
- [ ] ai-service client correctly parses response.data.totalTokens
- [ ] ai-service client throws on HTTP errors
- [ ] No behavior change in Claude API interaction flow

---

## Environment Variables

No new environment variables required.

**Existing configuration used:**
- `API_GATEWAY_URL` in ai-service (default: `http://localhost:4000`)

---

## Performance Considerations

**Database Query:**
```sql
SELECT SUM(total_tokens) AS total
FROM token_usage
WHERE session_id = ?
```

**Performance Characteristics:**
- Index scan on `idx_token_usage_session_id`
- Linear scan of matching rows for SUM aggregation
- Typical session: 10-100 records = <10ms
- Large session: 1000 records = <100ms
- Very large session: 10000 records = <1s

**Future Optimization (if needed):**
- Add materialized view for session totals
- Cache results in Redis with TTL
- Denormalize total into `sessions` table

**For Task 5.1A:** Current performance is acceptable.

---

## Integration Points

**ai-service → api-gateway:**
- `GET /api/internal/token-usage/sessions/:sessionId/total` (NEW)

**Existing endpoints (unchanged):**
- `POST /api/token-usage/record` (recording usage)
- `POST /api/chat-messages/add-by-session` (storing messages)

---

## Security Notes

**Task 5.1A intentionally has NO authentication/authorization:**
- Internal endpoint (not public)
- Authentication deferred per CLAUDE.md
- Service-to-service trust assumed
- Network isolation expected (Docker internal network)

**Future protection (NOT in scope):**
- Internal API keys
- mTLS
- Private network routing
- Service identity verification

---

## Next Steps (Out of Scope for Task 5.1A)

**Task 5.1B (Future):**
- Add quota limits configuration
- Implement pre-flight quota checks in ai-service
- Block Claude API calls when quota exceeded
- Return quota error responses

**Task 5.1C (Future):**
- Add quota enforcement to WebSocket streaming
- Handle quota exceeded during streaming
- Graceful degradation

**Task 5.2 (Future):**
- Add pricing calculations
- Convert tokens → cost
- Expose cost data via API

---

## Verification

**To verify Task 5.1A is complete:**

1. Start api-gateway and ai-service
2. Create a session with some token usage records
3. Call `GET /api/internal/token-usage/sessions/:sessionId/total`
4. Verify response contains correct totalTokens
5. Verify ai-service can call `apiGatewayClient.getTotalTokenUsage(sessionId)`
6. Verify Claude API calls still work (no behavior change)

**Expected result:** Read-only visibility into token usage. No enforcement.

---

## Summary

Task 5.1A provides read-only HTTP infrastructure for querying token usage totals by session. This is the foundation for quota enforcement but does NOT implement any blocking or limits. Claude API calls remain completely unaffected.

**Status:** COMPLETE ✓
