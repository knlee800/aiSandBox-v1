# Project Checkpoint: End of Phase 7.3 — Preview & Public Routing

**Checkpoint Date:** 2026-01-25
**Status:** ✅ STABLE — PHASE BOUNDARY
**Last Completed Task:** Task 7.3C (Expose Previews Publicly)

---

## High-Level Summary

Phase 7.3 introduced **preview port registration and public HTTP routing** for session containers, enabling users to access web applications running inside sandboxed containers.

All preview features:
- Execute inside containers
- Use in-memory port registry (no database writes)
- Reuse frozen Docker exec and networking primitives
- Expose public HTTP proxy with fail-fast validation
- Enforce strict error semantics (404/500/502)

**Phase 7.3 is now feature-complete and frozen.**

---

## What Is Complete

### Task 7.3A — Preview Port Registration (Internal Only)

**Endpoint:** `POST /api/internal/sessions/:id/previews`

**Capabilities:**
- Register preview port for a session container
- Validate port range (1024-65535)
- Validate container exists and is running
- Store mapping in-memory only (no database persistence)
- Return confirmation: `{ sessionId, port, registered: true }`

**Error Handling:**
- Invalid port → 400 Bad Request
- Container not running → 500 Internal Server Error
- Missing/invalid auth → 403 Forbidden

**Implementation:**
- Service: `PreviewService`
- Controller: `InternalPreviewsController`
- Storage: In-memory `Map<string, number>`
- Auth: `X-Internal-Service-Key` required

---

### Task 7.3B — Preview Proxy Skeleton (Internal Only)

**Endpoint:** `ALL /internal-previews/proxy/:sessionId/*`

**Capabilities:**
- Proxy HTTP traffic to registered container preview ports
- Resolve container IP from Docker network
- Forward all HTTP methods (GET/POST/PUT/DELETE/etc)
- Path rewriting (strip proxy prefix)
- Proxy error handling (502 Bad Gateway)

**Error Handling:**
- Unregistered session → 404 Not Found
- Container not running → 500 Internal Server Error
- Proxy connection failed → 502 Bad Gateway

**Implementation:**
- Service: `PreviewProxyService`
- Controller: `InternalPreviewsProxyController`
- Library: `http-proxy-middleware`
- Route: Internal-only (no auth guard, internal network)

**Networking:**
- Containers reachable on Docker bridge network
- Proxy uses container IP + registered port
- No WebSocket support in this phase

---

### Task 7.3C — Expose Previews Publicly (Safe Preview Routing)

**Endpoint:** `ALL /previews/:sessionId/*`

**Capabilities:**
- Public HTTP proxy for accessing session container previews
- Reuses `PreviewProxyService` for validation and target resolution
- Forwards all HTTP methods transparently
- Path rewriting (strip `/previews/:sessionId` prefix)
- No authentication required (public endpoint)

**Error Handling:**
- Unregistered preview → 404 Not Found
- Container not running → 500 Internal Server Error
- Proxy connection failed → 502 Bad Gateway

**Implementation:**
- Controller: `PreviewsController`
- Reuses: `PreviewProxyService` (from Task 7.3B)
- Route: Public-facing

**Security Model:**
- Session isolation via Docker networking
- Only forwards to registered preview ports
- No direct container access without registration

---

## Architectural Guarantees (UNCHANGED)

### Frozen & Untouched

- **Phase 6:** Container lifecycle (create, start, stop, remove)
- **Phase 7.1:** Containerized execution (`execInContainerBySessionId`)
- **Phase 7.2:** Container filesystem operations (read, write, list, stat)
- Docker exec implementation
- Container naming convention (`sandbox-session-{sessionId}`)
- Database schemas
- Authentication guards (`X-Internal-Service-Key` for internal APIs)

---

## Phase 7.3 Invariants (NEW)

### Preview Port Registry
- **Storage:** In-memory only (`Map<string, number>`)
- **Scope:** One port per session
- **Lifecycle:** Manual registration, no automatic cleanup
- **Validation:** Port range 1024-65535, container must be running
- **No Persistence:** Lost on service restart (intentional)

### Preview Proxy Behavior
- **Target Resolution:** sessionId → container IP + registered port
- **Network Discovery:** Docker inspect NetworkSettings.Networks
- **Fail-Fast:** Unregistered or stopped containers → immediate error
- **No Retries:** Single connection attempt only
- **No Background Jobs:** Synchronous proxy only

### Public Preview Routing
- **Public Endpoint:** `/previews/:sessionId/*`
- **No Authentication:** Public access (isolation via Docker)
- **Path Preservation:** Request path suffix preserved
- **HTTP Only:** No WebSocket support (yet)
- **Error Transparency:** Returns 404/500/502 directly to client

---

## Error Semantics (LOCKED)

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Invalid port range | 400 | "Port must be an integer between 1024 and 65535" |
| Missing port in request | 400 | "Request body field 'port' is required" |
| No port registered | 404 | "No preview port registered for session {id}" |
| Container not found | 500 | "Failed to validate container for session {id}: ..." |
| Container not running | 500 | "Container for session {id} is not running" |
| No container IP | 500 | "Container for session {id} has no IP address" |
| Proxy connection failed | 502 | "Bad Gateway" / "Failed to connect to preview server" |
| Missing auth (internal) | 403 | "Forbidden" |

---

## Internal API Surface (Phase 7.3)

| Operation | Method | Endpoint | Auth Required |
|-----------|--------|----------|---------------|
| Register preview port | POST | `/api/internal/sessions/:id/previews` | Yes (X-Internal-Service-Key) |
| Internal proxy (optional) | ALL | `/internal-previews/proxy/:sessionId/*` | No (internal network) |

---

## Public API Surface (Phase 7.3)

| Operation | Method | Endpoint | Auth Required |
|-----------|--------|----------|---------------|
| Access preview | ALL | `/previews/:sessionId/*` | No |

---

## Known Limitations (Accepted)

### Not Implemented in Phase 7.3

- ❌ WebSocket support
- ❌ TLS termination
- ❌ Access control (authentication/authorization)
- ❌ Rate limiting
- ❌ Request/response logging
- ❌ Preview health checks
- ❌ Automatic preview cleanup
- ❌ Port conflict detection
- ❌ Preview lifecycle management
- ❌ Database persistence of preview state
- ❌ Preview metrics/analytics
- ❌ Multiple ports per session
- ❌ Custom domain support
- ❌ Preview expiration
- ❌ Connection pooling
- ❌ Retry logic

### Intentional Design Choices

- **In-memory storage:** Preview ports lost on restart (stateless design)
- **Manual registration:** No auto-detection of container ports
- **No cleanup:** Registrations persist until service restart
- **No concurrency control:** Single port per session, last write wins
- **No validation of target service:** Proxy assumes port is valid
- **No preview discovery:** Client must know sessionId

---

## Assumptions Locked at This Phase

### Trusted Internal Proxy
- Internal proxy endpoints assume trusted callers
- No malicious request validation beyond standard HTTP parsing
- Docker network assumed secure and isolated

### Docker Network Reachability
- Containers accessible via bridge network IP
- Container-manager service can reach all container IPs
- No NAT, firewall, or custom network rules

### No Database Writes
- Preview features are ephemeral
- No persistence of preview state, logs, or metrics
- Service restart clears all preview registrations

### Single Port Per Session
- One preview port per session
- Re-registration overwrites previous port
- No multi-port applications in this phase

### HTTP Only
- No WebSocket proxying
- No Server-Sent Events (SSE) support (may work, not tested)
- No HTTP/2 push

### No Preview Lifecycle Hooks
- No callbacks on preview start/stop
- No integration with container lifecycle events
- No automatic cleanup on container stop

---

## Phase Boundary Statement

✅ **Phase 7.3 is COMPLETE and IMMUTABLE**

All preview capabilities required for:
- Registering preview ports
- Proxying HTTP traffic to containers
- Public preview access
- Safe error handling

are now available and stable.

---

## Next Logical Phases (Not Started)

### Phase 7.4: Git Operations Inside Containers
- Initialize git repos in containers
- Auto-commit on file changes
- Checkpoint management
- Diff/patch workflows

### Phase 8: Lifecycle Automation & Cleanup
- Container auto-stop on idle
- Workspace cleanup
- Preview de-registration on container stop
- Resource monitoring

### Phase 9: Preview Enhancements
- WebSocket support
- Access control (auth/authz)
- Preview health checks
- Metrics and logging
- Multi-port support

**Each new phase must not modify Phase 6, 7.1, 7.2, or 7.3 guarantees.**

---

## Safe Resume Point

**Next Task:** TBD (awaiting user instructions)

**To Continue Work:**
1. Do NOT modify Phase 7.3 code (frozen)
2. Assume preview APIs are stable
3. Build on top, never inside, existing logic
4. Introduce new guarantees only in new phases

---

## File Inventory (Phase 7.3)

### New Files Created

**Preview Services:**
- `services/container-manager/src/previews/preview.service.ts`
- `services/container-manager/src/previews/preview-proxy.service.ts`

**Preview Controllers:**
- `services/container-manager/src/previews/internal-previews.controller.ts` (Task 7.3A)
- `services/container-manager/src/previews/internal-previews-proxy.controller.ts` (Task 7.3B)
- `services/container-manager/src/previews/previews.controller.ts` (Task 7.3C - public)

### Modified Files

**Module Wiring:**
- `services/container-manager/src/sessions/sessions.module.ts`

### Unchanged (Frozen)

- All Phase 6 files (container lifecycle)
- All Phase 7.1 files (exec primitive)
- All Phase 7.2 files (filesystem operations)
- Docker runtime service
- Sessions service
- Database schemas
- Internal service auth guard

---

## Testing Checklist

### Task 7.3A - Preview Port Registration
- ✅ Register valid port (1024-65535)
- ✅ Reject invalid port range
- ✅ Reject missing port
- ✅ Validate container is running
- ✅ Return registration confirmation
- ✅ Require X-Internal-Service-Key

### Task 7.3B - Internal Preview Proxy
- ✅ Proxy GET/POST/PUT/DELETE requests
- ✅ Return 404 for unregistered session
- ✅ Return 500 for stopped container
- ✅ Return 502 for proxy connection failure
- ✅ Strip path prefix correctly
- ✅ Preserve request path suffix

### Task 7.3C - Public Preview Routing
- ✅ Public endpoint accessible without auth
- ✅ Proxy all HTTP methods
- ✅ Return 404 for unregistered preview
- ✅ Return 500 for stopped container
- ✅ Return 502 for proxy failure
- ✅ Reuse preview proxy service validation

---

## Deployment Notes

### Environment Variables Required
- `INTERNAL_SERVICE_KEY` - Shared secret for internal APIs
- `DOCKER_HOST` - Docker daemon socket (default: unix:///var/run/docker.sock)
- `PORT` - Container-manager service port (default: 4002)

### Docker Requirements
- Docker daemon accessible
- Containers on bridge network (default)
- Container IPs routable from container-manager service

### Known Operational Considerations
- Preview registrations lost on service restart
- No automatic cleanup of stale registrations
- No health monitoring of preview targets
- No connection limits or rate limiting

---

**END OF PHASE 7.3 CHECKPOINT**

Resume work by reviewing this checkpoint and confirming understanding before proceeding to next task.
