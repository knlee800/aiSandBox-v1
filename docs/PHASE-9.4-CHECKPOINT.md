# Phase 9.4 Checkpoint — Quota Evaluation Engine

**Phase Name:** Phase 9.4 — Quota Evaluation Engine
**Checkpoint Date:** 2026-01-27T10:35:00Z
**Summary:** Phase 9.4 introduces a read-only quota evaluation engine that computes quota status from aggregated usage data. The engine calculates token, cost, and termination quotas with status thresholds (OK/WARN/EXCEEDED) but does NOT enforce quotas or block requests. All logic is internal-only and uses hard-coded temporary limits.

---

## Completed Tasks

### Task 9.3A: Persist Governance Termination Events (NO behavior change) ✓ COMPLETED
- Added `governance_events` table to SQLite schema for passive logging
- Implemented `GovernanceEventsService` for best-effort event logging
- Integrated logging into `checkAndEnforceMaxLifetime()` and `checkAndEnforceIdleTimeout()`
- All logging is best-effort (never blocks termination)
- Events include: session_id, user_id, termination_reason, terminated_at, source

### Task 9.3B: Quota & Billing Aggregation Hooks (NO behavior change) ✓ COMPLETED
- Added indexes for efficient aggregation queries on governance_events, sessions, token_usage
- Implemented `UsageAggregationService` with read-only aggregation methods:
  - `aggregateTokenUsageBySession(sessionId)` - Token usage per session
  - `aggregateTokenUsageByUser(userId, startDate?, endDate?)` - Token usage per user
  - `aggregateTokenUsageByProvider(userId, startDate?, endDate?)` - Token usage by AI provider
  - `aggregateGovernanceEventsByReason(userId?, startDate?, endDate?)` - Governance events by reason
  - `aggregateGovernanceEventsByUser(startDate?, endDate?)` - Governance events by user
  - `aggregateSessionTerminations(userId?)` - Session lifecycle summary
  - `getUserUsageSummary(userId, startDate?, endDate?)` - Comprehensive usage report
- Created `InternalUsageAggregationController` with internal-only endpoints under `/api/internal/usage-aggregations`
- All queries are parameterized and use indexed columns
- No database writes, no enforcement, no blocking

### Task 9.4A: Quota Evaluation Engine (NO behavior change) ✓ COMPLETED
- Implemented `QuotaEvaluationService` for read-only quota status calculation
- Hard-coded temporary quota limits:
  - `MAX_TOKENS_PER_USER_PER_MONTH = 1,000,000`
  - `MAX_COST_USD_PER_USER_PER_MONTH = $50.00`
  - `MAX_TERMINATIONS_PER_MONTH = 100`
- Status calculation rules:
  - `OK`: all percentages < 80%
  - `WARN`: any percentage ≥ 80% and < 100%
  - `EXCEEDED`: any percentage ≥ 100%
- Evaluation methods:
  - `evaluateUserQuota(userId, startDate, endDate)` - Quota evaluation for custom period
  - `evaluateUserQuotaCurrentMonth(userId)` - Quota evaluation for current month
  - `evaluateUserQuotaDetailed(userId, startDate, endDate)` - Detailed per-category status
  - `hasUserExceededQuota(userId, startDate, endDate)` - Boolean check
  - `isUserApproachingQuotaLimit(userId, startDate, endDate)` - Boolean check
  - `getQuotaLimits()` - Get configured limits
- Created `InternalQuotaEvaluationController` with internal-only endpoints under `/api/internal/quota-evaluations`
- All logic leverages `UsageAggregationService` (no direct DB queries)
- No request blocking, no enforcement, calculation only

---

## What Is Intentionally NOT Done Yet

**Phase 9.5 - Quota Enforcement:**
- Quota enforcement and request blocking (HTTP 429 Too Many Requests)
- Pre-request quota checks in session lifecycle
- Enforcement integration with public API endpoints

**Phase 9.6 - Per-Plan Quotas:**
- Per-plan quota limits (free/pro/enterprise)
- Configurable quota tables or per-user overrides
- Dynamic quota configuration from database
- Externalization of quota limits to environment variables

**Phase 9.7 - Quota Notifications:**
- Email notifications when approaching limits (WARN state)
- Webhook notifications for quota events
- Admin alerts on EXCEEDED state
- Proactive user communication

**Phase 9.8 - Billing Integration:**
- Stripe or payment gateway integration
- Invoice generation based on usage
- Overage billing for EXCEEDED quotas
- Payment collection and receipt generation

**Phase 9.9 - Admin Dashboard:**
- Admin UI for viewing quota status per user
- Real-time quota monitoring interface
- Historical quota trends and analytics
- User-level usage insights and reports

**Phase 9.10 - Public API Enforcement:**
- Public API rate limiting based on quotas
- Per-endpoint quota tracking
- Public-facing quota headers (X-RateLimit-*)
- Client-side quota visibility

**Not Yet Implemented:**
- Background jobs for quota monitoring
- Scheduled quota reset (monthly rollover)
- Quota grace periods
- Quota appeal workflows
- Multi-tenant quota isolation
- Quota analytics and forecasting

---

## Current Architectural Guarantees

### Read-Only Architecture
- **Container-manager quota evaluation is READ-ONLY**
  - No database writes performed by quota evaluation logic
  - No modifications to session lifecycle
  - No request blocking or rejection
- **All quota logic leverages UsageAggregationService**
  - No direct raw table queries in quota evaluation
  - Single source of truth for aggregated data
  - Consistent data retrieval patterns

### Internal-Only Service Surface
- **All internal quota evaluation endpoints enforce `InternalServiceAuthGuard`**
  - Requires `X-Internal-Service-Key` header
  - Returns `401 Unauthorized` if header missing or invalid
  - No public API surface changes at this phase
- **Trusted internal proxy forwards internal auth headers correctly**
  - Assumes internal service key is securely configured
  - No validation of header format beyond presence check
  - No rate limiting on internal endpoints (trust boundary)

### Data Accuracy Assumptions
- **UsageAggregationService provides accurate aggregated usage data**
  - Token usage totals are correct sums from `token_usage` table
  - Governance events are complete from `governance_events` table
  - Session termination data is consistent with `sessions` table
- **No plan-based limits yet (hard-coded only)**
  - All users evaluated against same quotas
  - No differentiation by `plan_type` column
  - No per-user overrides or exceptions

### Status Computation Guarantees
- **Compute logic has defined thresholds per category**
  - Token percentage = (input_tokens + output_tokens) / MAX_TOKENS × 100
  - Cost percentage = total_cost_usd / MAX_COST_USD × 100
  - Termination percentage = total_terminations / MAX_TERMINATIONS × 100
- **Overall status is highest status across all categories**
  - Any EXCEEDED → overall EXCEEDED
  - Any WARN (and no EXCEEDED) → overall WARN
  - All OK → overall OK
- **Percentage calculations handle edge cases**
  - Division by zero: returns 100% if used > 0, else 0%
  - Rounding: percentages rounded to 2 decimal places
  - Negative values: not expected, but would calculate as-is

### No Background Processing
- **No background jobs for notifications**
- **No scheduled tasks for quota resets**
- **No cron jobs for monitoring**
- **Request-driven evaluation only**

---

## Locked Error Semantics

### HTTP Status Codes

**400 Bad Request:**
- Missing required query parameters (`startDate`, `endDate`)
- Invalid date format (not ISO 8601)
- Malformed request parameters

**401 Unauthorized:**
- Missing `X-Internal-Service-Key` header
- Invalid internal service key value
- Expired or revoked service credentials

**200 OK:**
- Successful quota evaluation (regardless of quota status)
- Returns JSON with quota details
- Status field indicates OK/WARN/EXCEEDED (not HTTP status)

**500 Internal Server Error:**
- Unexpected database errors during aggregation
- Service failures in UsageAggregationService
- Unhandled exceptions in calculation logic

**NOT YET IMPLEMENTED (Phase 9.5+):**
- `429 Too Many Requests` - Quota enforcement not active
- `402 Payment Required` - Billing integration not implemented
- Quota-specific error codes or custom headers

---

## Internal-Only Service Guarantees

### Authentication Requirements

**All internal quota evaluation endpoints require:**
```bash
curl -H "X-Internal-Service-Key: <your-key>" \
  "http://localhost:4001/api/internal/quota-evaluations/..."
```

**Auth header validation paths:**
1. Request arrives at internal endpoint
2. `InternalServiceAuthGuard` canActivate() called
3. Guard reads `X-Internal-Service-Key` from headers
4. Compares against `process.env.INTERNAL_SERVICE_KEY`
5. Returns `true` if match, throws `UnauthorizedException` if not
6. Controller method executes only after guard passes

**No public API surface changes:**
- No new public endpoints at this phase
- No modifications to existing public API behavior
- No client-facing quota headers or metadata
- Internal endpoints isolated from public traffic

---

## Safe Resume Point

**Phase 9.4: ✓ COMPLETE**

All tasks in Phase 9.4 have been completed:
- ✓ Task 9.3A: Persist Governance Termination Events
- ✓ Task 9.3B: Quota & Billing Aggregation Hooks
- ✓ Task 9.4A: Quota Evaluation Engine

**Key Deliverables:**
- Governance event logging (passive, best-effort)
- Read-only usage aggregation APIs (internal)
- Read-only quota evaluation engine (internal)
- Hard-coded temporary quota limits with status logic
- Internal-only endpoints with authentication
- No request blocking or enforcement

**No Remaining Tasks:**
Phase 9.4 is fully complete with no pending work.

**Next Phase:**
- **Task 9.5: Quota Enforcement** — Implement blocking on quota exceeded and public API enforcement

**Next Task Description:**
Task 9.5 will introduce actual quota enforcement:
- Pre-request quota checks in session lifecycle methods
- HTTP 429 Too Many Requests for quota violations
- Enforcement integration with existing governance checks
- Per-operation quota validation (exec, file ops, etc.)
- Graceful degradation when quota service unavailable

**Current State:**
- Quota evaluation is fully functional and tested
- All aggregation data is available via internal APIs
- Status calculation (OK/WARN/EXCEEDED) is accurate
- Ready for enforcement layer to consume evaluation results

**Architecture Ready For:**
- Quota enforcement guards (request blocking)
- Public API integration (rate limit headers)
- Per-plan quota configuration (dynamic limits)
- Quota notification system (alerts and webhooks)
- Billing integration (overage tracking)

---

## Example Response Payloads

### Basic Quota Evaluation
```json
{
  "userId": "test-user-001",
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-31T23:59:59.999Z"
  },
  "tokens": {
    "used": 750000,
    "limit": 1000000,
    "percentage": 75.0
  },
  "cost": {
    "used": 42.50,
    "limit": 50.0,
    "percentage": 85.0
  },
  "terminations": {
    "count": 45,
    "limit": 100,
    "percentage": 45.0
  },
  "status": "WARN"
}
```

### Detailed Quota Evaluation (Per-Category Status)
```json
{
  "userId": "test-user-001",
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-31T23:59:59.999Z"
  },
  "tokens": {
    "used": 750000,
    "limit": 1000000,
    "percentage": 75.0,
    "status": "OK"
  },
  "cost": {
    "used": 42.50,
    "limit": 50.0,
    "percentage": 85.0,
    "status": "WARN"
  },
  "terminations": {
    "count": 45,
    "limit": 100,
    "percentage": 45.0,
    "status": "OK"
  },
  "overallStatus": "WARN"
}
```

### Quota Exceeded Example
```json
{
  "userId": "test-user-001",
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-31T23:59:59.999Z"
  },
  "tokens": {
    "used": 1200000,
    "limit": 1000000,
    "percentage": 120.0
  },
  "cost": {
    "used": 55.00,
    "limit": 50.0,
    "percentage": 110.0
  },
  "terminations": {
    "count": 105,
    "limit": 100,
    "percentage": 105.0
  },
  "status": "EXCEEDED"
}
```

### Boolean Check: Exceeded
```json
{
  "userId": "test-user-001",
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-31T23:59:59.999Z"
  },
  "exceeded": true
}
```

### Boolean Check: Approaching Limit
```json
{
  "userId": "test-user-001",
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-31T23:59:59.999Z"
  },
  "approachingLimit": true
}
```

### Quota Limits Configuration
```json
{
  "maxTokensPerMonth": 1000000,
  "maxCostUsdPerMonth": 50.0,
  "maxTerminationsPerMonth": 100,
  "warnThresholdPercentage": 80.0,
  "exceededThresholdPercentage": 100.0
}
```

---

## Testing Instructions (curl)

### Evaluate Quota for Current Month
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/quota-evaluations/user/test-user-001/current-month"
```

### Evaluate Quota for Custom Period
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/quota-evaluations/user/test-user-001?startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z"
```

### Get Detailed Evaluation (Per-Category Status)
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/quota-evaluations/user/test-user-001/detailed?startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z"
```

### Check if User Exceeded Quota
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/quota-evaluations/user/test-user-001/exceeded?startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z"
```

### Check if User Approaching Limit
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/quota-evaluations/user/test-user-001/approaching-limit?startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z"
```

### Get Quota Limits Configuration
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/quota-evaluations/limits"
```

### Aggregation API Examples (Task 9.3B)

**Token Usage by User:**
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/usage-aggregations/tokens/user/test-user-001?startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z"
```

**Governance Events by Reason:**
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/usage-aggregations/governance-events/by-reason?userId=test-user-001"
```

**User Usage Summary:**
```bash
curl -H "X-Internal-Service-Key: your-internal-key" \
  "http://localhost:4001/api/internal/usage-aggregations/user/test-user-001/summary"
```

---

## Key Assumptions Locked at This Phase

### Data Integrity Assumptions
- **UsageAggregationService provides accurate aggregated usage data**
  - Token counts are correct sums from `token_usage` table
  - Costs are accurate based on recorded `cost_usd` values
  - Governance events are complete from best-effort logging
  - Session termination data is consistent with `sessions.terminated_at`

### Internal Service Trust
- **Trusted internal proxy forwards internal auth headers correctly**
  - `X-Internal-Service-Key` is securely transmitted
  - No header tampering or injection between services
  - Internal network is trusted (no MITM attacks)
  - Service keys are rotated and managed securely

### Single-Tenant Model
- **No plan-based limits yet (hard-coded only)**
  - All users share identical quota limits
  - No differentiation by `users.plan_type` column
  - No per-user overrides or exceptions
  - No organization-level quota pooling

### Stateless Evaluation
- **No background jobs for notifications**
  - Quota evaluation is request-driven only
  - No scheduled tasks monitor quota thresholds
  - No proactive alerts sent to users
  - Notification responsibility deferred to Phase 9.7+

### Current Month Calculation
- **Current month date range is UTC-based**
  - Start: First day of month at 00:00:00 UTC
  - End: Last day of month at 23:59:59.999 UTC
  - No timezone conversions or user-specific calendars
  - Month boundaries are absolute (no rolling windows)

### Percentage Rounding
- **All percentages rounded to 2 decimal places**
  - Example: 85.4567% → 85.46%
  - Used for display consistency
  - Status thresholds (80%, 100%) apply after rounding
  - No cumulative rounding errors (calculated fresh each time)

### Edge Case Handling
- **Division by zero returns 100% if used > 0, else 0%**
- **Negative values not expected but calculated as-is**
- **Missing aggregation data treated as zero usage**
- **Null user_id handled gracefully (nullable in governance_events)**

---

## Files Modified Summary (Phase 9.4)

### Task 9.3A Files
| File | Type | Changes |
|------|------|---------|
| `database/schema-sqlite.sql` | Schema | Added `governance_events` table |
| `src/governance/governance-events.service.ts` | New | Best-effort event logging service |
| `src/sessions/sessions.module.ts` | Modified | Registered GovernanceEventsService |
| `src/sessions/sessions.service.ts` | Modified | Added logging to termination paths |

### Task 9.3B Files
| File | Type | Changes |
|------|------|---------|
| `database/schema-sqlite.sql` | Schema | Added aggregation indexes |
| `src/usage/usage-aggregation.service.ts` | New | Read-only aggregation service |
| `src/usage/internal-usage-aggregation.controller.ts` | New | Internal aggregation API |
| `src/usage/usage.module.ts` | New | Usage module definition |
| `src/app.module.ts` | Modified | Registered UsageModule |

### Task 9.4A Files
| File | Type | Changes |
|------|------|---------|
| `src/usage/quota-evaluation.service.ts` | New | Quota evaluation service |
| `src/usage/internal-quota-evaluation.controller.ts` | New | Internal quota API |
| `src/usage/usage.module.ts` | Modified | Added quota services |

**Total:** 11 files touched, 6 new files created across Phase 9.4

---

**End of Phase 9.4 Checkpoint**
