# Project Checkpoint: End of Phase 7.4 — Preview Access Control & Health

**Checkpoint Date:** 2026-01-25
**Status:** ✅ STABLE — PHASE BOUNDARY
**Last Completed Task:** Task 7.4B (Preview Health Check)

---

## High-Level Summary

Phase 7.4 extended **Phase 7.3 (Preview & Public Routing)** by adding:
- **Optional JWT-based access control** for preview URLs
- **Health check endpoint** for monitoring preview service availability

All preview features remain:
- In-memory only (no database writes)
- HTTP-only (no WebSocket support yet)
- Best-effort availability (no HA guarantees)
- Docker bridge network-based routing

**Phase 7.4 is now feature-complete and frozen.**

---

## What Is Complete

### Phase 7.3 Tasks (From Previous Checkpoint)

#### Task 7.3A — Preview Port Registration (Internal Only)
**Endpoint:** `POST /api/internal/sessions/:id/previews`
- Register preview port for session container (1024-65535)
- In-memory storage only
- X-Internal-Service-Key auth required
- Error handling: 400 (invalid port), 403 (no auth), 500 (container not running)

#### Task 7.3B — Preview Proxy Skeleton (Internal Only)
**Endpoint:** `ALL /internal-previews/proxy/:sessionId/*`
- Internal HTTP proxy to container preview ports
- Docker network-based routing (container IP + port)
- Path rewriting and error handling
- Error handling: 404 (not registered), 500 (not running), 502 (proxy failed)

#### Task 7.3C — Expose Previews Publicly (Safe Preview Routing)
**Endpoint:** `ALL /previews/:sessionId/*`
- Public HTTP proxy for accessing container previews
- Reuses PreviewProxyService from 7.3B
- No authentication (public access by default)
- Error handling: 404 (not registered), 500 (not running), 502 (proxy failed)

---

### Phase 7.4 Tasks (NEW)

#### Task 7.4A — Preview Access Control

**Capability:**
- Optional JWT-based access control for public preview URLs
- Controlled by `ENABLE_PREVIEW_ACCESS_CONTROL` environment variable
- When enabled:
  - Validates JWT from Authorization header (Bearer token)
  - Extracts user ID from JWT payload (sub or userId)
  - Checks session ownership via SessionsService
  - Returns 401 for missing/invalid JWT
  - Returns 403 for unauthorized access (wrong user)
- When disabled (default):
  - Public access (Phase 7.3C behavior)

**Implementation:**
- Modified: `PreviewsController` only
- Added: JWT verification using `jsonwebtoken` library
- Added: Session ownership check via database query
- Added: Environment configuration flags

**Configuration:**
```bash
ENABLE_PREVIEW_ACCESS_CONTROL=false  # Default: public access
ENABLE_PREVIEW_ACCESS_CONTROL=true   # Enable JWT-based access control
JWT_SECRET=<secret>                  # Must match api-gateway JWT_SECRET
```

**Error Handling:**
- 401 Unauthorized: Missing, invalid, or expired JWT
- 403 Forbidden: Valid JWT but user doesn't own session
- All other errors unchanged from Phase 7.3C

---

#### Task 7.4B — Preview Health Check Endpoint

**Endpoint:** `GET /previews/:sessionId/health`

**Capability:**
- Lightweight health check for preview services
- Returns structured JSON indicating reachability
- Validates registration and container state
- Attempts HTTP connection to preview service

**Behavior:**
1. Validate preview port is registered (404 if not)
2. Validate container is running (500 if not)
3. Attempt HTTP GET to preview service (5 second timeout)
4. Return health status

**Response (Healthy):**
```json
{
  "healthy": true,
  "sessionId": "abc123",
  "port": 3000,
  "statusCode": 200
}
```

**Response (Unhealthy):**
```json
{
  "healthy": false,
  "sessionId": "abc123",
  "port": 3000,
  "error": "Connection refused"
}
```

**Health Logic:**
- `healthy: true` = HTTP connection succeeded (any status code 2xx-5xx)
- `healthy: false` = Connection failed (ECONNREFUSED, timeout, network error)
- Returns HTTP status code from preview service if reachable

**Error Handling:**
- 404 Not Found: No preview port registered
- 500 Internal Server Error: Container not running
- 200 OK: Health status returned (even if unhealthy)

**No Access Control:**
- Health check is public (no JWT required)
- Allows frontend to check status before authentication
- Only reveals registration/running state, not content

---

## Architectural Guarantees (UNCHANGED from Phase 7.3)

### Frozen & Untouched

- **Phase 6:** Container lifecycle
- **Phase 7.1:** Containerized execution
- **Phase 7.2:** Container filesystem operations
- **Phase 7.3:** Preview port registry, proxy, public routing
- Docker exec implementation
- Container naming convention
- Database schemas (sessions table)
- Internal service authentication

---

## Phase 7.4 Invariants (NEW)

### Preview Access Control
- **Optional:** Disabled by default (public access)
- **JWT-Based:** Uses jsonwebtoken library for verification
- **Ownership Check:** Queries sessions table for user_id
- **No DB Writes:** Read-only session lookup
- **Environment Controlled:** ENABLE_PREVIEW_ACCESS_CONTROL flag
- **Secret Sharing:** JWT_SECRET must match api-gateway

### Health Check Behavior
- **Public Endpoint:** No authentication required
- **Connection Test:** HTTP GET with 5 second timeout
- **Status Codes Accepted:** Any HTTP response (2xx, 3xx, 4xx, 5xx)
- **Fail-Fast Validation:** Reuses PreviewProxyService for registration/container checks
- **No Retries:** Single connection attempt only
- **Error Differentiation:** ECONNREFUSED vs other connection failures

---

## Error Semantics (EXTENDED)

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| **Access Control (7.4A)** |
| Missing JWT (when enabled) | 401 | "Missing or invalid authorization token" |
| Invalid JWT (when enabled) | 401 | "Invalid token" |
| Expired JWT (when enabled) | 401 | "Token has expired" |
| Wrong user (when enabled) | 403 | "You do not have permission to access this preview" |
| **Health Check (7.4B)** |
| Service reachable | 200 | { healthy: true, statusCode: <code> } |
| Service unreachable | 200 | { healthy: false, error: "Connection refused" } |
| **Existing (7.3)** |
| Invalid port range | 400 | "Port must be an integer between 1024 and 65535" |
| No port registered | 404 | "No preview port registered for session {id}" |
| Container not running | 500 | "Container for session {id} is not running" |
| Proxy connection failed | 502 | "Bad Gateway" / "Failed to connect to preview server" |

---

## Public API Surface (Phase 7.4)

| Operation | Method | Endpoint | Auth Required | Notes |
|-----------|--------|----------|---------------|-------|
| Access preview | ALL | `/previews/:sessionId/*` | Optional (config) | JWT if ENABLE_PREVIEW_ACCESS_CONTROL=true |
| Health check | GET | `/previews/:sessionId/health` | No | Public endpoint |

---

## Internal API Surface (Unchanged)

| Operation | Method | Endpoint | Auth Required |
|-----------|--------|----------|---------------|
| Register preview port | POST | `/api/internal/sessions/:id/previews` | Yes (X-Internal-Service-Key) |
| Internal proxy (optional) | ALL | `/internal-previews/proxy/:sessionId/*` | No (internal network) |

---

## Known Limitations (Accepted)

### Not Implemented in Phase 7.4

- ❌ WebSocket support / HTTP upgrade
- ❌ Server-Sent Events (SSE)
- ❌ Preview teardown / cleanup automation
- ❌ Rate limiting on preview access
- ❌ Request/response logging
- ❌ Preview access logs / audit trail
- ❌ Multi-user collaboration (shared previews)
- ❌ Preview expiration / TTL
- ❌ Connection pooling
- ❌ Retry logic for health checks
- ❌ Background health monitoring
- ❌ Health check caching
- ❌ Custom health check endpoints (always uses GET /)
- ❌ TLS termination
- ❌ Custom domain support
- ❌ Preview metrics/analytics
- ❌ Multiple ports per session
- ❌ Port conflict detection

### Intentional Design Choices

- **In-memory storage:** Preview ports lost on restart (stateless)
- **Manual registration:** No auto-detection of container ports
- **No cleanup hooks:** Registrations persist until service restart
- **Single port per session:** Last write wins on re-registration
- **No concurrency control:** Race conditions possible on registration
- **Optional access control:** Public by default, opt-in security
- **Health check is public:** No JWT required for status checks
- **HTTP only:** No WebSocket/SSE proxying (yet)
- **Best-effort health:** Single connection attempt, no retries

---

## Assumptions Locked at This Phase

### Trusted Internal Proxy (Unchanged)
- Internal proxy endpoints assume trusted callers
- No malicious request validation beyond HTTP parsing
- Docker network assumed secure and isolated

### Docker Network Reachability (Unchanged)
- Containers accessible via bridge network IP
- Container-manager service can reach all container IPs
- No NAT, firewall, or custom network rules

### No Database Writes for Preview Features (Unchanged)
- Preview features are ephemeral
- No persistence of preview state, logs, or metrics
- Service restart clears all preview registrations
- Access control reads sessions table but doesn't write

### Single Port Per Session (Unchanged)
- One preview port per session
- Re-registration overwrites previous port
- No multi-port applications

### HTTP Only (Unchanged)
- No WebSocket proxying
- No Server-Sent Events (SSE) support (may work, not tested)
- No HTTP/2 push

### JWT Compatibility (NEW)
- JWT payload must contain `sub` or `userId` field
- JWT_SECRET must match api-gateway configuration
- JWT verification uses jsonwebtoken library (standard implementation)
- No custom JWT validation logic

### Health Check Semantics (NEW)
- Health based on connection success, not HTTP status
- 5 second timeout is hardcoded
- Always checks GET / (root path)
- No custom health endpoints supported

---

## Phase Boundary Statement

✅ **Phase 7.4 is COMPLETE and IMMUTABLE**

All preview capabilities required for:
- Registering preview ports
- Proxying HTTP traffic to containers
- Public preview access with optional security
- Monitoring preview service health

are now available and stable.

---

## Next Logical Phases (Not Started)

### Phase 7.5: WebSocket & Upgrade Support
- WebSocket proxying for real-time apps
- HTTP upgrade handling (ws://)
- Server-Sent Events (SSE) support
- Connection lifecycle management

### Phase 7.6: Preview Lifecycle Management
- Automatic preview cleanup on container stop
- Preview expiration / TTL
- Port conflict detection
- Resource limits

### Phase 7.7: Preview Observability
- Access logs and audit trail
- Metrics (request count, latency, errors)
- Health check monitoring
- Preview analytics

### Phase 8: Container Auto-Cleanup
- Container auto-stop on idle
- Workspace cleanup
- Resource monitoring and limits

**Each new phase must not modify Phase 6, 7.1, 7.2, 7.3, or 7.4 guarantees.**

---

## Safe Resume Point

**Next Task:** Task 7.4C: WebSocket / Upgrade Support for Previews (NOT STARTED)

**Alternative Next Tasks:**
- Task 7.5A: Preview Lifecycle Hooks (auto-cleanup)
- Task 7.6A: Preview Access Logs
- Task 8.1A: Container Idle Detection

**To Continue Work:**
1. Do NOT modify Phase 7.4 code (frozen)
2. Assume preview APIs are stable
3. Build on top, never inside, existing logic
4. Introduce new guarantees only in new phases
5. Review access control configuration before deployment

---

## File Inventory (Phase 7.4)

### New Files (Phase 7.3)
- `services/container-manager/src/previews/preview.service.ts`
- `services/container-manager/src/previews/preview-proxy.service.ts`
- `services/container-manager/src/previews/internal-previews.controller.ts`
- `services/container-manager/src/previews/internal-previews-proxy.controller.ts`
- `services/container-manager/src/previews/previews.controller.ts`

### Modified Files (Phase 7.4)

**Access Control (Task 7.4A):**
- `services/container-manager/src/previews/previews.controller.ts` (extended)
- `services/container-manager/package.json` (added jsonwebtoken dependencies)
- `services/container-manager/.env.example` (added configuration)

**Health Check (Task 7.4B):**
- `services/container-manager/src/previews/previews.controller.ts` (extended)

### Unchanged (Frozen)
- All Phase 6 files (container lifecycle)
- All Phase 7.1 files (exec primitive)
- All Phase 7.2 files (filesystem operations)
- All Phase 7.3 files (preview registry, proxy services)
- Docker runtime service
- Sessions service
- Database schemas
- Internal service auth guard

---

## Testing Checklist

### Task 7.3A - Preview Port Registration
- ✅ Register valid port (1024-65535)
- ✅ Reject invalid port range
- ✅ Validate container is running
- ✅ Require X-Internal-Service-Key

### Task 7.3B - Internal Preview Proxy
- ✅ Proxy all HTTP methods
- ✅ Return 404 for unregistered session
- ✅ Return 500 for stopped container
- ✅ Return 502 for proxy failure

### Task 7.3C - Public Preview Routing
- ✅ Public endpoint accessible
- ✅ Proxy all HTTP methods
- ✅ Path rewriting works correctly

### Task 7.4A - Preview Access Control
- ✅ Public access when disabled (default)
- ✅ JWT validation when enabled
- ✅ Return 401 for missing/invalid JWT
- ✅ Return 401 for expired JWT
- ✅ Return 403 for wrong user
- ✅ Session ownership check via database
- ✅ Configuration via environment variable

### Task 7.4B - Preview Health Check
- ✅ Health check endpoint works
- ✅ Returns healthy when service reachable
- ✅ Returns unhealthy when connection fails
- ✅ Includes HTTP status code when reachable
- ✅ Returns 404 for unregistered session
- ✅ Returns 500 for stopped container
- ✅ No authentication required

---

## Deployment Notes

### Environment Variables Required

**Core Configuration:**
- `INTERNAL_SERVICE_KEY` - Shared secret for internal APIs
- `DOCKER_HOST` - Docker daemon socket (default: unix:///var/run/docker.sock)
- `PORT` - Container-manager service port (default: 4002)

**Access Control (Task 7.4A):**
- `ENABLE_PREVIEW_ACCESS_CONTROL` - Enable JWT-based access control (default: false)
- `JWT_SECRET` - JWT signing secret (must match api-gateway when access control enabled)

### Dependencies Added (Phase 7.4)
- `jsonwebtoken: ^9.0.2` - JWT verification library
- `@types/jsonwebtoken: ^9.0.5` - TypeScript types

### Docker Requirements
- Docker daemon accessible
- Containers on bridge network (default)
- Container IPs routable from container-manager service

### Known Operational Considerations
- Preview registrations lost on service restart
- No automatic cleanup of stale registrations
- No health monitoring of preview targets (except on-demand checks)
- No connection limits or rate limiting
- Access control disabled by default (public access)
- Health checks are synchronous (may block on slow services)

### Security Considerations
- **Public Access:** Preview URLs are public by default
- **Enable Access Control:** Set ENABLE_PREVIEW_ACCESS_CONTROL=true for production
- **JWT Secret:** Must be kept secure and match api-gateway
- **Health Checks:** Public endpoint, may leak session existence

---

## Migration Notes

### Upgrading from Phase 7.3 to Phase 7.4

**No Breaking Changes:**
- Default behavior is unchanged (public access)
- All existing endpoints continue to work
- No database migrations required

**New Features:**
- Access control is opt-in via environment variable
- Health check endpoint is new public route

**Configuration Changes:**
```bash
# Add to .env (optional)
ENABLE_PREVIEW_ACCESS_CONTROL=true
JWT_SECRET=your_jwt_secret_here
```

**Code Changes:**
- No code changes required
- Rebuild/restart service to pick up new features

---

**END OF PHASE 7.4 CHECKPOINT**

Resume work by reviewing this checkpoint and confirming understanding before proceeding to next task.
