# Task 4.2: container-manager ↔ api-gateway HTTP Integration

## Overview

This document describes the HTTP-only integration between `container-manager` and `api-gateway` for session lifecycle management and git checkpoint recording.

**Architecture Rule:** NO cross-service imports. All communication is HTTP-only.

---

## Components Created

### 1. container-manager HTTP Client

**File:** `aiSandBox/services/container-manager/src/clients/api-gateway-http.client.ts`

**Purpose:** HTTP client for container-manager → api-gateway communication

**Methods:**
- `notifySessionStarted(sessionId)` - Notify when session starts
- `notifySessionStopped(sessionId)` - Notify when session stops
- `notifySessionError(sessionId)` - Notify when session encounters error
- `recordGitCheckpoint(data)` - Record git checkpoint after auto-commit

**Configuration:**
- Base URL: `process.env.API_GATEWAY_URL` (default: `http://localhost:4000`)
- Error handling: Fail fast (no retries)

---

### 2. api-gateway Internal Controllers

#### Session Lifecycle Controller

**File:** `aiSandBox/services/api-gateway/src/sessions/internal-session.controller.ts`

**Routes:**
- `POST /api/internal/sessions/:sessionId/start` - Start session (PENDING → ACTIVE)
- `POST /api/internal/sessions/:sessionId/stop` - Stop session (ACTIVE → STOPPED)
- `POST /api/internal/sessions/:sessionId/error` - Mark session error (ANY → ERROR)

**Usage:** Called by container-manager to update session status in PostgreSQL

#### Git Checkpoint Controller

**File:** `aiSandBox/services/api-gateway/src/git-checkpoints/internal-git-checkpoint.controller.ts`

**Routes:**
- `POST /api/internal/git-checkpoints` - Record git checkpoint

**Request Body:**
```json
{
  "sessionId": "string (UUID)",
  "commitHash": "string (Git SHA)",
  "filesChanged": "number",
  "messageNumber": "number | null (optional)",
  "description": "string | null (optional)"
}
```

**Usage:** Called by container-manager after each git auto-commit

---

## Request Flow

### Session Start Flow

```
1. User creates session
   ↓
2. container-manager SessionsService.createSession()
   ↓
3. Creates workspace directory + SQLite record
   ↓
4. ApiGatewayHttpClient.notifySessionStarted(sessionId)
   ↓
5. HTTP POST → api-gateway /api/internal/sessions/:sessionId/start
   ↓
6. api-gateway SessionService.startSession(sessionId)
   ↓
7. Updates PostgreSQL session.status = 'ACTIVE'
```

**Integration Point:**
`aiSandBox/services/container-manager/src/sessions/sessions.service.ts:53`

---

### Session Stop Flow

```
1. User stops session
   ↓
2. container-manager SessionsService.stopSession()
   ↓
3. Updates SQLite session.status = 'stopped'
   ↓
4. ApiGatewayHttpClient.notifySessionStopped(sessionId)
   ↓
5. HTTP POST → api-gateway /api/internal/sessions/:sessionId/stop
   ↓
6. api-gateway SessionService.stopSession(sessionId)
   ↓
7. Updates PostgreSQL session.status = 'STOPPED'
```

**Integration Point:**
`aiSandBox/services/container-manager/src/sessions/sessions.service.ts:132`

---

### Session Error Flow

```
1. Container error detected
   ↓
2. container-manager calls ApiGatewayHttpClient.notifySessionError(sessionId)
   ↓
3. HTTP POST → api-gateway /api/internal/sessions/:sessionId/error
   ↓
4. api-gateway SessionService.markSessionError(sessionId)
   ↓
5. Updates PostgreSQL session.status = 'ERROR'
```

**Integration Point:**
Available via `ApiGatewayHttpClient` (not yet wired to error handlers)

---

### Git Checkpoint Recording Flow

```
1. AI makes code changes
   ↓
2. container-manager GitService.commit()
   ↓
3. Executes git add + git commit
   ↓
4. Stores checkpoint in local SQLite (backward compatibility)
   ↓
5. ApiGatewayHttpClient.recordGitCheckpoint({...})
   ↓
6. HTTP POST → api-gateway /api/internal/git-checkpoints
   ↓
7. api-gateway GitCheckpointService.recordCheckpoint({...})
   ↓
8. Persists to PostgreSQL git_checkpoints table
```

**Integration Point:**
`aiSandBox/services/container-manager/src/git/git.service.ts:138`

---

## Modified Files

### container-manager

1. **Created:**
   - `src/clients/api-gateway-http.client.ts` - HTTP client
   - `src/clients/clients.module.ts` - Module export

2. **Modified:**
   - `src/sessions/sessions.service.ts` - Added session start/stop notifications
   - `src/sessions/sessions.module.ts` - Imported ClientsModule
   - `src/git/git.service.ts` - Added checkpoint recording via HTTP
   - `src/git/git.module.ts` - Imported ClientsModule

### api-gateway

3. **Created:**
   - `src/sessions/internal-session.controller.ts` - Session lifecycle endpoints
   - `src/git-checkpoints/internal-git-checkpoint.controller.ts` - Checkpoint endpoint

4. **Modified:**
   - `src/sessions/session.module.ts` - Registered InternalSessionController
   - `src/git-checkpoints/git-checkpoint.module.ts` - Registered InternalGitCheckpointController

---

## Error Handling

### container-manager (caller)
- All HTTP calls wrapped in try-catch
- Logs errors but continues execution
- Does NOT block primary operations on API gateway failure
- Maintains local SQLite records as fallback

### api-gateway (receiver)
- Returns appropriate HTTP status codes (200, 201, 404, 500)
- Throws NotFoundException if session not found
- Database errors bubble up as 500 Internal Server Error

---

## Environment Variables

### container-manager
```bash
API_GATEWAY_URL=http://localhost:4000  # Default if not set
```

### api-gateway
No new environment variables required. Uses existing database configuration.

---

## Testing Checklist

- [ ] Session start: Verify PostgreSQL session status updates to ACTIVE
- [ ] Session stop: Verify PostgreSQL session status updates to STOPPED
- [ ] Session error: Verify PostgreSQL session status updates to ERROR
- [ ] Git checkpoint: Verify checkpoint appears in PostgreSQL git_checkpoints table
- [ ] Error resilience: Verify container-manager continues if api-gateway is down
- [ ] Backward compat: Verify local SQLite checkpoints still recorded

---

## Architecture Compliance

✅ NO cross-service imports
✅ HTTP-only communication
✅ api-gateway owns persistence (PostgreSQL)
✅ container-manager keeps local SQLite for backward compatibility
✅ Fail-fast error handling (no retries)
✅ Clear separation of concerns

---

## Next Steps (Out of Scope for Task 4.2)

- Remove SQLite database from container-manager (migration to full HTTP)
- Add authentication/authorization to internal endpoints
- Add retry logic with exponential backoff (if needed)
- Add circuit breaker pattern (if needed)
- Monitor HTTP call latency and failure rates
