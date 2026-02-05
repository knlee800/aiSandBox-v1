# Phase 8.3 Checkpoint — Idle Timeout + Max Lifetime Enforcement

**Date:** 2026-01-26

---

## Completed Tasks

- **Task 8.3A:** Session Idle Timeout (Request-Driven)
  - In-memory tracking of last activity timestamp per session
  - Request-driven enforcement (no background workers)
  - HTTP 410 Gone returned when idle timeout exceeded
  - Container stopped and removed when timeout detected
  - Activity tracked for: exec, file read, file write, directory list, stat

- **Task 8.3B:** Session Max Lifetime (Absolute)
  - Absolute lifetime enforcement from session creation time
  - Reads `created_at` from database as source of truth
  - Lifetime is NEVER reset by activity
  - HTTP 410 Gone returned when max lifetime exceeded
  - Container stopped and removed when lifetime exceeded
  - Enforced BEFORE idle timeout check

---

## Enforcement Ordering Guarantees

**Critical ordering** implemented in all activity methods:

1. **FIRST:** `checkAndEnforceMaxLifetime(sessionId)`
   - Absolute limit from session creation
   - Read from database `created_at` field
   - If exceeded → HTTP 410 Gone

2. **SECOND:** `checkAndEnforceIdleTimeout(sessionId)`
   - Relative limit from last activity
   - Tracked in-memory
   - If exceeded → HTTP 410 Gone

3. **THEN:** Proceed with operation

**Why this order matters:**
- Max lifetime is the ultimate authority (absolute cap)
- If both limits are exceeded, lifetime error is reported
- Lifetime cannot be "bypassed" by staying active
- Ensures predictable session expiry

---

## What is Intentionally NOT Done Yet

- No background sweepers or cleanup workers
- No scheduled jobs or cron tasks
- No distributed coordination across container-manager instances
- No persistence of enforcement state (activity tracking, exec counters)
- No cluster-safe enforcement mechanisms
- No per-user or global rate limits
- No idle timeout for preview proxy traffic
- No session lifecycle state machine in code

---

## Current Governance Guarantees

### Session Max Lifetime
- **Absolute limit** from session creation time
- Source of truth: `sessions.created_at` in SQLite database
- Config: `GovernanceConfig.sessionMaxLifetimeMs`
- Never reset by activity
- Enforced first, before all other checks
- HTTP 410 Gone on expiry
- Container stopped and removed (best-effort)

### Session Idle Timeout
- **Relative limit** from last successful activity
- Source of truth: in-memory `Map<sessionId, timestamp>`
- Config: `GovernanceConfig.sessionIdleTimeoutMs`
- Reset on every successful operation
- Enforced second, after max lifetime check
- HTTP 410 Gone on expiry
- Container stopped and removed (best-effort)

### Exec Concurrency (from Task 8.2A)
- **Per-session limit** on concurrent exec operations
- Source of truth: in-memory `Map<sessionId, count>`
- Config: `GovernanceConfig.maxConcurrentExecsPerSession`
- HTTP 429 returned when limit exceeded
- Enforced third, after lifetime and idle checks

### Container Resource Limits (from Task 8.1B)
- **CPU, memory, PID limits** at container creation
- Config: `GovernanceConfig` resource limit fields
- Enforced by Docker daemon
- Set once at container creation time

---

## Activity Definition

Operations that count as "activity" for idle timeout:
- `execInContainer` - Command execution
- `readFileFromContainer` - File read
- `writeFileToContainer` - File write
- `listDirectoryInContainer` - Directory listing
- `statPathInContainer` - Path stat

Operations that do NOT count as "activity":
- Preview proxy traffic
- Health checks
- Session metadata queries (getSession, listUserSessions)
- Container lifecycle operations (start, stop, remove)

---

## Enforcement Model

### Request-Driven Only
- All governance checks happen at HTTP request boundaries
- No background processes poll for expired sessions
- No timers, intervals, or scheduled tasks
- Lazy enforcement: sessions only expire when next request arrives

### Why Lazy Enforcement Works
- Idle containers are harmless (not consuming resources actively)
- Eventually someone will try to use them and they'll be cleaned up
- Avoids complexity of background workers
- Single-process design remains simple
- No distributed coordination required

### Cleanup Guarantees
When a session expires (lifetime or idle):
1. In-memory tracking cleaned up (`lastActivity`, `activeExecs`)
2. Container stopped and removed (best-effort)
3. HTTP 410 Gone returned to client
4. Error message includes reason and elapsed time

Cleanup happens even if container stop/remove fails.

---

## Architecture Invariants

### Request-Driven Governance
- All enforcement at HTTP request boundaries
- No background workers, timers, or schedulers
- No polling or periodic checks
- Sessions expire when next request arrives

### SQLite as Source of Truth for Creation Time
- `sessions.created_at` is authoritative for lifetime calculations
- Created once during `createSession`
- Never modified
- Read-only access during enforcement

### In-Memory Tracking for Activity
- `lastActivity` map tracks last activity timestamp
- `activeExecs` map tracks concurrent exec count
- Both are ephemeral (lost on process restart)
- No database writes for governance state

### HTTP 410 Gone for Expired Sessions
- Max lifetime exceeded → HTTP 410 Gone
- Idle timeout exceeded → HTTP 410 Gone
- Error messages distinguish between the two
- Container cleanup attempted (best-effort)

### Single-Process Enforcement
- Assumes one Node.js instance per container-manager
- Not cluster-safe
- No coordination across multiple instances
- Acceptable for current architecture phase

### No Database Writes for Governance
- Enforcement is entirely in-memory (except reading `created_at`)
- No new tables or columns
- No writes during enforcement checks
- Faster checks, no write contention

---

## Error Message Semantics

### Max Lifetime Exceeded
```
HTTP 410 Gone
"Session {sessionId} expired due to max lifetime exceeded (lifetime: {elapsed}s, limit: {limit}s)"
```

### Idle Timeout Exceeded
```
HTTP 410 Gone
"Session {sessionId} expired due to inactivity (idle for {elapsed}s, limit: {limit}s)"
```

Both errors:
- Include actual elapsed time
- Include configured limit
- Clearly state the reason
- Help users understand why their session expired

---

## Safe Resume Point

**Next Task:** Task 8.4A — Session Termination & Finalization Semantics

This task will define and implement proper session termination workflows, including:
- Graceful shutdown sequences
- Resource cleanup guarantees
- State transitions
- Finalization hooks

---

## Summary

Phase 8.3 completed comprehensive session governance enforcement with two complementary mechanisms:

1. **Max Lifetime (Absolute Cap)**
   - Hard time limit from session creation
   - Never reset by activity
   - Enforces fair resource allocation
   - Prevents infinite sessions

2. **Idle Timeout (Activity-Based)**
   - Reclaims inactive resources
   - Reset by user activity
   - Complements max lifetime
   - Prevents resource waste

**Key Design Decisions:**

- **Request-driven enforcement** eliminates background worker complexity
- **Ordered checks** (lifetime → idle → concurrency) provide clear precedence
- **Database read-only** governance keeps hot paths fast
- **In-memory tracking** provides simple, efficient enforcement
- **HTTP 410 Gone** clearly communicates expiration to clients
- **Best-effort cleanup** ensures resources are freed

The system now provides robust runtime governance while maintaining architectural simplicity. All enforcement is:
- Transparent (clear error messages)
- Predictable (absolute limits, documented ordering)
- Efficient (in-memory checks, no database writes)
- Simple (no background workers, no distributed coordination)

Future phases can extend this foundation if cluster-safe enforcement or persistent tracking becomes necessary.
