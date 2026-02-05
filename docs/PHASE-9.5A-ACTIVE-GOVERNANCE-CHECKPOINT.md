# Phase 9.5A Checkpoint — Active Governance (Quota Enforcement)

**Phase Name:** Phase 9.5A — Active Governance (Quota Enforcement)
**Checkpoint Date:** 2026-01-27T12:00:00Z
**Summary:** Phase 9.5A introduces the first active, user-impacting governance control. Quota enforcement now blocks operations when users exceed defined limits, transitioning from passive observation (logging, aggregation, evaluation) to active enforcement (request blocking). All blocking is request-driven, fail-open, and uses HTTP 429 with structured errors.

---

## Phase Overview

### Purpose of Phase 9.5A

Phase 9.5A completes the governance pipeline by adding **active enforcement** at request time. Prior phases established:

- **Phase 9.3A:** Passive governance event logging (best-effort)
- **Phase 9.3B:** Read-only usage aggregation (internal APIs)
- **Phase 9.4A:** Read-only quota evaluation (calculation only)

Phase 9.5A introduces **request-time blocking** when quotas are exceeded:
- Operations are rejected with HTTP 429 Too Many Requests
- Users cannot execute commands, read/write files, or register previews
- Blocking is stateless, reproducible, and survives restarts
- Fail-open policy ensures availability over strict enforcement

### Transition: Passive → Active Governance

**Before Phase 9.5A:**
- Governance events logged (no blocking)
- Usage aggregated (no blocking)
- Quotas evaluated (no blocking)
- Users could exceed quotas without restriction

**After Phase 9.5A:**
- Quotas actively enforced at request time
- Users blocked when EXCEEDED status reached
- HTTP 429 returned with structured error
- Operations not executed when blocked
- No state mutation on blocked requests

**Completion Date:** January 27, 2026

---

## Completed Tasks

### Task 9.3A: Governance Event Logging ✓ COMPLETE
- Added `governance_events` table to SQLite schema
- Implemented `GovernanceEventsService` for best-effort logging
- Integrated logging into termination paths (max_lifetime, idle_timeout)
- All logging is passive (never blocks termination)
- Events include: session_id, user_id, termination_reason, terminated_at, source

### Task 9.3B: Usage Aggregation Hooks ✓ COMPLETE
- Added indexes for efficient aggregation queries
- Implemented `UsageAggregationService` with read-only methods:
  - Token usage by session/user/provider
  - Governance events by reason/user
  - Session termination summaries
  - Comprehensive user usage summaries
- Created internal-only endpoints under `/api/internal/usage-aggregations`
- All queries are parameterized and use indexed columns

### Task 9.4A: Quota Evaluation Engine ✓ COMPLETE
- Implemented `QuotaEvaluationService` for read-only quota calculation
- Hard-coded temporary quota limits:
  - MAX_TOKENS_PER_USER_PER_MONTH = 1,000,000
  - MAX_COST_USD_PER_USER_PER_MONTH = $50.00
  - MAX_TERMINATIONS_PER_MONTH = 100
- Status calculation (OK/WARN/EXCEEDED) based on thresholds
- Created internal-only endpoints under `/api/internal/quota-evaluations`
- No request blocking (calculation only)

### Task 9.5A: Quota Enforcement (Request-Time Blocking) ✓ COMPLETE
- Integrated `QuotaEvaluationService` into all session operation paths
- Added `checkAndEnforceQuota()` method to SessionsService
- Enforcement points:
  - execInContainer
  - readFileFromContainer
  - writeFileToContainer
  - listDirectoryInContainer
  - statPathInContainer
  - registerPreviewPort (preview.service.ts)
- HTTP 429 returned when quota EXCEEDED
- Fail-open behavior on evaluation errors
- No state mutation when blocked

---

## Active Governance Architecture

### Complete Enforcement Flow

All session operations follow this locked enforcement chain:

```
1. HTTP Request arrives
   ↓
2. assertSessionUsableOrThrow(sessionId)
   └─ Check: Is session terminated? (DB-backed)
   └─ If YES → HTTP 410 Gone
   ↓
3. checkAndEnforceMaxLifetime(sessionId)
   └─ Check: Has session exceeded max lifetime? (DB-backed)
   └─ If YES → Write termination to DB → Log event → HTTP 410 Gone
   ↓
4. checkAndEnforceIdleTimeout(sessionId)
   └─ Check: Has session been idle too long? (In-memory)
   └─ If YES → Write termination to DB → Log event → HTTP 410 Gone
   ↓
5. checkAndEnforceQuota(sessionId) ← NEW (Task 9.5A)
   └─ Check: Has user exceeded quota? (Calculated from aggregated data)
   └─ If YES → HTTP 429 Too Many Requests
   └─ If evaluation fails → Fail-open (allow request)
   ↓
6. Operation-specific checks
   └─ Example: Concurrent exec limit (HTTP 429)
   ↓
7. Execute operation
   └─ Docker runtime call
   ↓
8. updateLastActivity(sessionId)
   └─ Reset idle timeout timer
   ↓
9. HTTP 200 OK with result
```

### Enforcement Ordering Guarantees

**Critical ordering:**
1. **Session termination** (permanent, DB-backed) → HTTP 410
2. **Max lifetime** (permanent, absolute) → HTTP 410 + DB write
3. **Idle timeout** (permanent, relative) → HTTP 410 + DB write
4. **Quota enforcement** (temporary, monthly reset) → HTTP 429 ← NEW
5. **Operation-specific** (e.g., exec concurrency) → HTTP 429

**Why this order:**
- Permanent checks before temporary checks
- DB-backed authority before computed authority
- Lifecycle violations terminate sessions permanently
- Quota violations block temporarily (reset monthly)
- Quota does NOT trigger termination (non-destructive)

### Data Flow: Passive → Active

**Passive Pipeline (Phases 9.3-9.4):**
```
Sessions Operations
  ↓
Governance Events Logged (best-effort)
  ↓
Events Aggregated (read-only)
  ↓
Quotas Evaluated (calculation only)
  ↓
[No blocking]
```

**Active Pipeline (Phase 9.5A):**
```
Sessions Operations
  ↓
Governance Events Logged (best-effort)
  ↓
Events Aggregated (read-only)
  ↓
Quotas Evaluated (calculation only)
  ↓
Quota Enforcement (request-time blocking) ← NEW
  ↓
HTTP 429 if EXCEEDED
```

---

## Blocking Semantics (LOCKED)

### Only EXCEEDED Blocks

**Blocking rules:**
- **OK (< 80%):** Allow request (within limits)
- **WARN (80-99%):** Allow request (approaching limits, no block)
- **EXCEEDED (≥ 100%):** Block request with HTTP 429

**EXCEEDED triggers when ANY of:**
- Token usage ≥ 1,000,000 (input + output combined)
- Cost ≥ $50.00 USD
- Terminations ≥ 100

**Status determination:**
```typescript
if (any percentage >= 100%) → EXCEEDED (block)
else if (any percentage >= 80%) → WARN (allow)
else → OK (allow)
```

### HTTP 429 Response

**Blocked response format:**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Quota exceeded",
  "details": {
    "userId": "user-abc123",
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-01-31T23:59:59.999Z"
  }
}
```

**Does NOT include:**
- Token counts or usage metrics
- Quota limits (max values)
- Specific quota that was exceeded
- Internal calculation details

**Rationale:**
- Minimal information disclosure
- No internal metrics exposure
- Consistent with standard HTTP 429 format
- Users know quota exceeded and period affected

### No State Mutation on Block

**When quota enforcement blocks a request:**
- ❌ Operation NOT executed
- ❌ Session state NOT modified
- ❌ Activity timestamp NOT updated
- ❌ Governance termination NOT written
- ❌ Container commands NOT run
- ❌ Files NOT read/written

**Only action taken:**
- HTTP 429 response returned immediately
- Request rejected before operation execution
- Evaluation failure logged (if fail-open triggered)

### No Termination Logging

**Quota blocking is temporary, not permanent:**
- Quotas reset monthly (first day of month at 00:00:00 UTC)
- No `governance_events` record written
- No `sessions.terminated_at` written
- No session state change
- User can retry next month

**Contrast with lifecycle violations:**
- Max lifetime → writes termination to DB (permanent)
- Idle timeout → writes termination to DB (permanent)
- Quota exceeded → returns HTTP 429 (temporary)

---

## Fail-Open Policy (LOCKED)

### When Evaluation Fails

**Fail-open occurs when:**
- Database connection error reading session
- `UsageAggregationService` throws exception
- `QuotaEvaluationService` throws exception
- Any unexpected error during quota calculation

**Behavior:**
```typescript
catch (error) {
  if (error instanceof TooManyRequestsException) {
    throw error; // Re-throw legitimate quota blocks
  }

  // Otherwise, fail-open (allow request)
  console.error(`Quota evaluation failed, failing open:`, error.message);
  // Do not throw - request proceeds
}
```

**Result:**
- Request ALLOWED despite evaluation failure
- Error logged to console for monitoring
- No HTTP 429 returned
- Operation executes normally

### Why Fail-Open Exists

**Availability-first rationale:**
1. **Service continuity:** Quota system failure should not cause outage
2. **User experience:** False-positive blocks are worse than false-negative allowances
3. **Graceful degradation:** Core functionality (sessions, exec) remains operational
4. **Monitoring:** Failures logged for ops team to investigate
5. **Non-critical enforcement:** Quotas are cost controls, not security controls

**Trade-offs accepted:**
- Some over-quota usage may occur during quota system failures
- Financially acceptable (small margin of error)
- Better than blocking all users on quota system outage
- Logged errors enable rapid detection and remediation

### Fail-Open Examples

**Scenario 1: Database unreachable**
```
checkAndEnforceQuota() attempts to read session.user_id
  ↓
Database connection error thrown
  ↓
Caught by fail-open handler
  ↓
Error logged: "Quota evaluation failed, failing open"
  ↓
Request ALLOWED (operation executes)
```

**Scenario 2: Aggregation service failure**
```
quotaEvaluationService.hasUserExceededQuota() called
  ↓
usageAggregationService.aggregateTokenUsageByUser() throws
  ↓
Exception bubbles to checkAndEnforceQuota()
  ↓
Caught by fail-open handler
  ↓
Error logged
  ↓
Request ALLOWED
```

**Scenario 3: Legitimate quota exceeded**
```
quotaEvaluationService.hasUserExceededQuota() returns TRUE
  ↓
TooManyRequestsException thrown with details
  ↓
NOT caught by fail-open (instanceof check)
  ↓
Exception bubbles to controller
  ↓
HTTP 429 returned to client
```

---

## Locked Invariants (Phase 9.5A)

### Request-Driven Enforcement Only
- All quota checks happen at HTTP request boundaries
- No background workers polling for quota violations
- No scheduled tasks or cron jobs
- No timers or intervals monitoring quotas
- Lazy enforcement (quota checked when user makes request)

### No Background Jobs
- No sweepers cleaning up over-quota sessions
- No quota monitoring daemons
- No proactive notifications sent
- No scheduled quota resets (monthly boundary implicit)

### SQLite Source of Truth
- Session `user_id` read from SQLite
- Governance events aggregated from `governance_events` table
- Token usage aggregated from `token_usage` table
- Session termination from `sessions.terminated_at`
- All quota data sourced from database (no external APIs)

### Fail-Open Enforcement
- Quota evaluation errors do not block requests
- Availability prioritized over strict enforcement
- Errors logged for monitoring
- No cascading failures from quota system

### Internal-Only APIs
- All aggregation endpoints under `/api/internal/usage-aggregations`
- All evaluation endpoints under `/api/internal/quota-evaluations`
- Require `X-Internal-Service-Key` header (InternalServiceAuthGuard)
- No public API surface for quota queries

### No Billing Integration
- No Stripe API calls
- No payment gateway integration
- No invoice generation
- No billing webhooks
- No payment collection

### No New Dependencies
- No external libraries added
- No new npm packages installed
- No additional runtime requirements
- Uses existing NestJS framework and SQLite

### Minimal Diff
- Quota enforcement added as single private method
- One line inserted per enforcement point
- Public wrapper method for external services
- Module import added (UsageModule)
- No refactoring of existing code

---

## What Is Explicitly NOT Done (Phase 9.5A)

### Per-Plan Quotas
- No plan-based differentiation (free/pro/enterprise)
- No per-user quota overrides
- No plan-specific limits in database
- No `users.plan_type` integration
- All users share identical hard-coded limits

### Billing Integration
- No Stripe integration
- No payment processing
- No invoice generation
- No overage billing
- No payment collection
- No subscription management

### Quota Notifications
- No email alerts when approaching limits
- No webhooks fired on quota events
- No admin notifications on EXCEEDED
- No proactive user communication
- No dashboard warnings

### Admin Override
- No admin API to bypass quotas
- No manual quota adjustments
- No per-user exceptions
- No support team tooling
- No quota forgiveness workflows

### Background Sweepers
- No scheduled cleanup of over-quota sessions
- No background jobs monitoring quotas
- No cron tasks resetting quotas
- No workers polling for violations

### Per-User Overrides
- No user-specific quota configuration
- No manual limit adjustments per user
- No exception handling
- No grace periods
- No quota appeals

### Dynamic Configuration
- No externalized quota limits (env vars)
- No runtime quota updates
- No per-environment limits
- No A/B testing of quotas
- No gradual rollout controls

### Public API Enforcement
- No public-facing quota endpoints
- No rate limit headers (X-RateLimit-*)
- No client-side quota visibility
- No quota metadata in session responses

---

## Restart / Resume Safety (LOCKED)

### Blocking Is Stateless

**Quota enforcement has no persistent state:**
- No quota counters stored in database
- No "quota violated" flags persisted
- No enforcement history tracked
- Each request evaluated independently

**Restart behavior:**
```
Server restarts
  ↓
In-memory state lost (lastActivity, activeExecs)
  ↓
Quota evaluation rebuilds from database
  ↓
Usage aggregation queries fresh data
  ↓
Quota status recalculated from source tables
  ↓
Enforcement resumes with identical behavior
```

### Evaluation Is Reproducible

**Quota evaluation is deterministic:**
- Same inputs → same outputs
- No random factors
- No time-based decay (beyond month boundary)
- No external API calls
- No cached state

**Reproducibility guarantees:**
```
Given:
  - user_id = "abc123"
  - period = January 2026
  - token_usage table rows = [...]
  - governance_events table rows = [...]

Result:
  - Same quota status every time
  - Same percentages calculated
  - Same EXCEEDED/WARN/OK status
  - Restart-safe
```

### No In-Memory Authority

**All enforcement authority comes from database:**
- Session `user_id` → SQLite `sessions` table
- Token usage → SQLite `token_usage` table
- Governance events → SQLite `governance_events` table
- Termination status → SQLite `sessions.terminated_at`

**In-memory state is advisory only:**
- `lastActivity` map → tracks idle timeout (ephemeral)
- `activeExecs` map → tracks concurrency (ephemeral)
- Neither affects quota enforcement

**Process restart:**
```
Before restart:
  - In-memory maps populated
  - Quota evaluation working

During restart:
  - Process terminates
  - In-memory maps lost

After restart:
  - In-memory maps empty
  - Quota evaluation rebuilds from DB
  - Enforcement continues with same results
```

### Safe Restart Behavior

**Restart does NOT:**
- Reset quotas (monthly boundary only)
- Clear quota violations
- Forgive over-quota usage
- Change enforcement thresholds
- Lose quota data (DB-backed)

**Restart DOES:**
- Clear ephemeral maps (lastActivity, activeExecs)
- Rebuild quota evaluation from fresh DB queries
- Preserve all quota source data
- Resume enforcement immediately
- Maintain identical blocking behavior

---

## Safe Resume Point

**Phase 9.5A: ✓ COMPLETE**

All tasks in Phase 9.5A have been completed:
- ✓ Task 9.3A: Governance Event Logging
- ✓ Task 9.3B: Usage Aggregation Hooks
- ✓ Task 9.4A: Quota Evaluation Engine
- ✓ Task 9.5A: Quota Enforcement (Request-Time Blocking)

**Key Deliverables:**
- Active quota enforcement at request time
- HTTP 429 returned when quotas exceeded
- Fail-open policy for availability
- Stateless, reproducible blocking
- Minimal code changes
- No refactoring required

**No Remaining Tasks:**
Phase 9.5A is fully complete with no pending work.

**Next Task:**
- **Task 9.6A: Plan-Based Quota Configuration**

**Task 9.6A Description:**
Replace hard-coded quota limits with per-plan configuration:
- Read quota limits from `users.plan_type` (free/pro/enterprise)
- Define plan-specific limits in configuration
- Support per-plan token/cost/termination limits
- Maintain backward compatibility with hard-coded defaults
- No database schema changes (use existing `users.plan_type` column)

**Current State:**
- Quota enforcement fully operational
- All operations blocked when quotas exceeded
- Fail-open behavior ensures availability
- Ready for per-plan differentiation

**Architecture Ready For:**
- Plan-based quota limits (Task 9.6A)
- Quota notifications (Task 9.7+)
- Billing integration (Task 9.8+)
- Admin override APIs (Task 9.9+)
- Public quota visibility (Task 9.10+)

---

## Architecture Invariants (LOCKED)

### HTTP-Only Architecture
- All enforcement at HTTP request boundaries
- No WebSockets or streaming connections
- No persistent connections
- No long-polling
- Request-response only

### Single-Node Enforcement
- Designed for single container-manager instance
- No distributed coordination
- No cluster-safe locking
- No cross-node communication
- Acceptable for current scale

### SQLite Authority
- All quota data sourced from SQLite
- No external quota services
- No Redis caching of quotas
- No in-memory authority beyond request scope
- Database is single source of truth

### Ephemeral Memory
- In-memory maps are advisory (idle timeout, exec concurrency)
- Lost on restart, rebuilt on demand
- Not required for quota enforcement
- Quota evaluation rebuilds from DB

### Explicit Writes Only
- No implicit quota resets
- No background quota adjustments
- No automatic forgiveness
- No scheduled quota changes
- Monthly reset is implicit (date-based)

### No Workers
- No background jobs
- No scheduled tasks
- No cron jobs
- No timers or intervals
- No polling loops

### No Speculative Refactors
- No premature abstractions
- No "future-proofing" code
- No unused interfaces
- No over-engineered patterns
- Minimal viable enforcement

**LOCKED:** These invariants must not change in Phase 9.5A or earlier phases. Future phases may introduce controlled relaxations (e.g., cluster coordination, background monitoring) but only with explicit architecture decisions.

---

## Files Modified Summary (Phase 9.5A)

### Task 9.5A Files
| File | Type | Changes |
|------|------|---------|
| `src/sessions/sessions.service.ts` | Modified | Added quota enforcement (checkAndEnforceQuota + public wrapper) |
| `src/sessions/sessions.module.ts` | Modified | Imported UsageModule |
| `src/previews/preview.service.ts` | Modified | Added quota enforcement to preview registration |

**Total:** 3 files modified in Task 9.5A

### Phase 9.3-9.5 Cumulative Files
| File | Phase | Type |
|------|-------|------|
| `database/schema-sqlite.sql` | 9.3A/9.3B | Schema (tables + indexes) |
| `src/governance/governance-events.service.ts` | 9.3A | New |
| `src/sessions/sessions.service.ts` | 9.3A/9.5A | Modified |
| `src/sessions/sessions.module.ts` | 9.3A/9.5A | Modified |
| `src/usage/usage-aggregation.service.ts` | 9.3B | New |
| `src/usage/internal-usage-aggregation.controller.ts` | 9.3B | New |
| `src/usage/quota-evaluation.service.ts` | 9.4A | New |
| `src/usage/internal-quota-evaluation.controller.ts` | 9.4A | New |
| `src/usage/usage.module.ts` | 9.3B/9.4A | New/Modified |
| `src/app.module.ts` | 9.3B | Modified |
| `src/previews/preview.service.ts` | 9.5A | Modified |

**Total:** 11 files across Phase 9.3-9.5

---

## Behavioral Guarantees (Phase 9.5A)

### Enforcement Guarantees
- ✅ Quotas enforced at request time (not lazily)
- ✅ Blocking occurs only on EXCEEDED status
- ✅ HTTP 429 returned with structured error
- ✅ No state mutation when blocked
- ✅ No termination logging for quota violations

### Availability Guarantees
- ✅ Fail-open on evaluation errors
- ✅ Service remains operational if quota system fails
- ✅ Core functionality (exec, files) unaffected by quota failures
- ✅ Evaluation errors logged for monitoring

### Restart Guarantees
- ✅ Enforcement survives process restart
- ✅ Quota evaluation rebuilds from database
- ✅ No quota state lost on restart
- ✅ Identical blocking behavior after restart

### Ordering Guarantees
- ✅ Session termination checked first (HTTP 410)
- ✅ Max lifetime checked second (HTTP 410)
- ✅ Idle timeout checked third (HTTP 410)
- ✅ Quota enforcement checked fourth (HTTP 429)
- ✅ Operation-specific checks last

### Data Integrity Guarantees
- ✅ All quota data sourced from SQLite
- ✅ No external API calls during enforcement
- ✅ Deterministic evaluation (same inputs → same result)
- ✅ No cached quota state (fresh queries each time)

---

**End of Phase 9.5A Checkpoint — Active Governance (Quota Enforcement)**
