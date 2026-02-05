# Project Checkpoint: End of Phase 7 — Execution & Preview

**Checkpoint Date:** 2026-01-25
**Status:** ✅ STABLE — MAJOR PHASE BOUNDARY
**Last Completed Task:** Task 7.4C (WebSocket / Upgrade Support for Previews)

---

## High-Level Summary

**Phase 7** introduced **containerized code execution** and **public preview routing** for the AI Sandbox Platform.

This phase enables:
- **Safe code execution** inside isolated Docker containers
- **File operations** (read, write, list, stat) within container workspaces
- **Preview port registration** for exposing container web applications
- **HTTP + WebSocket proxying** to container preview services
- **Optional JWT-based access control** for preview URLs
- **Health monitoring** of preview services

All capabilities are:
- **Internal-only or public** (as designed per feature)
- **Fail-fast** with clear error semantics
- **Stateless** (in-memory registries, no background workers)
- **Container-scoped** (strict isolation via Docker)

**Phase 7 is now feature-complete and frozen.**

---

## Phase 7 Task Inventory

### Phase 7.1: Containerized Execution

#### Task 7.1A — Internal Container Exec Primitive
**Endpoint:** `POST /api/internal/sessions/:id/exec`

**Capabilities:**
- Execute commands inside session containers
- Capture stdout, stderr, exit code
- Support working directory and environment variables
- Enforce timeout (default 5 minutes, max 10 minutes)
- Use Docker exec API directly

**Implementation:**
- Service: `DockerRuntimeService.execInContainerBySessionId()`
- Controller: `InternalSessionsController`
- Auth: X-Internal-Service-Key required
- Error handling: 403 (no auth), 500 (container not found/not running/exec failed)

**Guarantees:**
- Synchronous execution only (no background jobs)
- Single timeout per execution
- No retries or fallback
- No streaming (waits for completion)

---

### Phase 7.2: Container Filesystem Operations

#### Task 7.2A — Container File Read (Read-Only)
**Endpoint:** `GET /api/internal/sessions/:id/files?path=...`

**Capabilities:**
- Read UTF-8 file content from /workspace
- Strict path validation (no .., no absolute paths)
- Uses `cat` via Docker exec

**Error Handling:**
- 400: Invalid path
- 500: Runtime/Docker failures

#### Task 7.2A-1 — Path Error Semantics Patch
- Invalid paths return HTTP 400 (not 500)
- Runtime failures remain HTTP 500
- Validation centralized in `validateWorkspacePath()`

#### Task 7.2B — Container File Write (Create / Overwrite)
**Endpoint:** `POST /api/internal/sessions/:id/files`

**Capabilities:**
- Create or overwrite files in /workspace
- Auto-create parent directories
- UTF-8 content supported
- Empty files allowed

**Implementation:**
- Uses environment variables + `printf "%s"` for safety
- Atomic write with `mkdir -p`
- No heredoc usage (security fix in Task 7.2B-1)

#### Task 7.2B-1 — File Write Safety Patch
- Removed unsafe heredoc usage
- Prevents shell injection and delimiter bugs

#### Task 7.2C — Container Directory Listing
**Endpoint:** `GET /api/internal/sessions/:id/dirs?path=...`

**Capabilities:**
- List files and directories in /workspace
- Includes hidden files, excludes . and ..
- Returns structured metadata: `{ name, type, size, modifiedAt }`
- Empty directories return empty array

#### Task 7.2D — File Stat / Existence
**Endpoint:** `GET /api/internal/sessions/:id/stat?path=...`

**Capabilities:**
- Check file/directory existence without erroring
- Returns metadata if exists: `{ exists: true, type, size, modifiedAt }`
- Returns `{ exists: false }` if not found (200 OK, not 404)
- Differentiates file vs directory

**Phase 7.2 Guarantees:**
- No file delete, rename, move, or chmod
- No binary streaming
- No large-file chunking
- No file locking or concurrency controls
- All operations scoped to /workspace only

---

### Phase 7.3: Preview Port Registration & Public Routing

#### Task 7.3A — Preview Port Registration (Internal Only)
**Endpoint:** `POST /api/internal/sessions/:id/previews`

**Capabilities:**
- Register preview port for session container (1024-65535)
- In-memory storage only (no database writes)
- Validate container is running before registration
- Return confirmation: `{ sessionId, port, registered: true }`

**Implementation:**
- Service: `PreviewService` with `Map<string, number>` registry
- Controller: `InternalPreviewsController`
- Auth: X-Internal-Service-Key required

**Error Handling:**
- 400: Invalid port range
- 403: Missing/invalid auth
- 500: Container not running

#### Task 7.3B — Preview Proxy Skeleton (Internal Only)
**Endpoint:** `ALL /internal-previews/proxy/:sessionId/*`

**Capabilities:**
- Internal HTTP proxy to registered container preview ports
- Resolve container IP from Docker network
- Forward all HTTP methods (GET, POST, PUT, DELETE, etc.)
- Path rewriting (strip proxy prefix)

**Implementation:**
- Service: `PreviewProxyService.getProxyTarget()`
- Controller: `InternalPreviewsProxyController`
- Library: `http-proxy-middleware`
- No auth guard (internal network only)

**Error Handling:**
- 404: Unregistered session
- 500: Container not running
- 502: Proxy connection failed

#### Task 7.3C — Expose Previews Publicly (Safe Preview Routing)
**Endpoint:** `ALL /previews/:sessionId/*`

**Capabilities:**
- Public HTTP proxy for accessing container previews
- Reuses `PreviewProxyService` for validation and target resolution
- Forwards all HTTP methods transparently
- Path rewriting (strip `/previews/:sessionId` prefix)
- No authentication required (public access by default)

**Implementation:**
- Controller: `PreviewsController`
- Reuses: `PreviewProxyService` from Task 7.3B
- Route: Public-facing

**Error Handling:**
- 404: Unregistered preview
- 500: Container not running
- 502: Proxy connection failed

**Security Model:**
- Session isolation via Docker networking
- Only forwards to registered preview ports
- No direct container access without registration

---

### Phase 7.4: Preview Access Control, Health & WebSocket

#### Task 7.4A — Preview Access Control
**Endpoint:** `ALL /previews/:sessionId/*` (extended)

**Capabilities:**
- Optional JWT-based access control for preview URLs
- Controlled by `ENABLE_PREVIEW_ACCESS_CONTROL` environment variable
- When enabled:
  - Validates JWT from Authorization header (Bearer token)
  - Extracts user ID from JWT payload (`sub` or `userId`)
  - Checks session ownership via `SessionsService.getSession()`
  - Returns 401 for missing/invalid/expired JWT
  - Returns 403 for unauthorized access (wrong user)
- When disabled (default):
  - Public access (Phase 7.3C behavior)

**Implementation:**
- Modified: `PreviewsController` only
- Added: JWT verification using `jsonwebtoken` library
- Added: Session ownership check via database query
- Configuration: `ENABLE_PREVIEW_ACCESS_CONTROL` and `JWT_SECRET` env vars

**Error Handling:**
- 401: Missing, invalid, or expired JWT
- 403: Valid JWT but user doesn't own session

#### Task 7.4B — Preview Health Check Endpoint
**Endpoint:** `GET /previews/:sessionId/health`

**Capabilities:**
- Lightweight health check for preview services
- Validates registration and container state
- Attempts HTTP connection to preview service (5s timeout)
- Returns structured JSON indicating reachability

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
- `healthy: true` = HTTP connection succeeded (any status code)
- `healthy: false` = Connection failed (ECONNREFUSED, timeout, etc.)

**No Access Control:**
- Health check is public (no JWT required)
- Only reveals registration/running state, not content

#### Task 7.4C — WebSocket / Upgrade Support for Previews
**Endpoint:** `ALL /previews/:sessionId/*` (extended)

**Capabilities:**
- WebSocket and HTTP upgrade support for preview proxy
- Enables dev server HMR (Vite, Next.js, CRA)
- Automatic upgrade detection via `Upgrade: websocket` header
- Same path rewriting for WebSocket connections
- Same access control enforcement (JWT validated before upgrade)

**Implementation:**
- Added `ws: true` to proxy middleware configuration
- Added `proxyReqWs` callback for logging WebSocket upgrades
- No new libraries required (http-proxy-middleware supports WebSocket)

**Dev Server Compatibility:**
- Vite HMR: `/@vite/client` WebSocket
- Next.js Fast Refresh: `/_next/webpack-hmr` WebSocket
- Create React App: `/ws` WebSocket
- Generic WebSocket endpoints

**Security:**
- Access control enforced before WebSocket upgrade
- Same session isolation as HTTP traffic
- No new attack surface (reuses existing proxy)

---

## Architectural Guarantees (Phase 7)

### Execution Model (7.1)
- **Synchronous Only**: No background job execution
- **Fail-Fast**: Single attempt, no retries
- **Timeout Enforced**: Default 5 min, max 10 min
- **No Streaming**: Waits for completion before returning
- **Internal-Only**: No public exec APIs

### Filesystem Operations (7.2)
- **Workspace-Scoped**: All paths relative to /workspace
- **Read-Only or Create/Overwrite**: No delete, rename, or move
- **UTF-8 Only**: No binary file support
- **Synchronous**: No chunking or streaming
- **No Concurrency Control**: Race conditions possible
- **Internal-Only**: No public file APIs

### Preview Registry (7.3A)
- **In-Memory Only**: Lost on service restart
- **Single Port Per Session**: Last write wins
- **No Auto-Cleanup**: Manual registration only
- **No Persistence**: Zero database writes
- **Internal-Only**: Registration requires X-Internal-Service-Key

### Preview Proxy (7.3B, 7.3C)
- **HTTP + WebSocket**: Both protocols supported
- **Path Rewriting**: Strips proxy prefix
- **Container IP Routing**: Docker bridge network
- **Fail-Fast**: Single connection attempt, no retries
- **Public or Internal**: Internal endpoint + public endpoint

### Access Control (7.4A)
- **Optional**: Disabled by default (public access)
- **JWT-Based**: Uses jsonwebtoken library
- **Session Ownership**: Database query for user_id
- **No DB Writes**: Read-only validation
- **Environment Controlled**: ENABLE_PREVIEW_ACCESS_CONTROL flag

### Health Checks (7.4B)
- **Public Endpoint**: No authentication required
- **Connection Test**: HTTP GET with 5s timeout
- **Status Agnostic**: Any HTTP response = healthy
- **Fail-Fast**: Single attempt, no retries

### WebSocket Support (7.4C)
- **Transparent Proxying**: Frames forwarded without inspection
- **Access Control**: JWT validated before upgrade
- **Dev Server HMR**: Vite, Next.js, CRA supported
- **No State Tracking**: Proxy is stateless

---

## Error Semantics (Phase 7 Complete)

### Execution Errors (7.1A)
| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Missing auth | 403 | "Forbidden" |
| Container not found | 500 | "Failed to find container for session {id}" |
| Container not running | 500 | "Container for session {id} is not running" |
| Exec failed | 500 | "Execution failed: {error}" |
| Timeout | 500 | "Execution timeout after {ms}ms" |

### Filesystem Errors (7.2A-D)
| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Invalid path | 400 | "Invalid path: {reason}" |
| Missing path param | 400 | "Query parameter 'path' is required" |
| Runtime failure | 500 | "Failed to {operation}: {error}" |
| Container not running | 500 | "Container for session {id} is not running" |

### Preview Errors (7.3A-C, 7.4A-C)
| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| Invalid port range | 400 | "Port must be an integer between 1024 and 65535" |
| Missing port | 400 | "Request body field 'port' is required" |
| Missing auth (internal) | 403 | "Forbidden" |
| Missing JWT (when enabled) | 401 | "Missing or invalid authorization token" |
| Invalid JWT | 401 | "Invalid token" |
| Expired JWT | 401 | "Token has expired" |
| Wrong user | 403 | "You do not have permission to access this preview" |
| No port registered | 404 | "No preview port registered for session {id}" |
| Container not running | 500 | "Container for session {id} is not running" |
| No container IP | 500 | "Container for session {id} has no IP address" |
| Proxy connection failed | 502 | "Bad Gateway" / "Failed to connect to preview server" |

### Health Check Responses (7.4B)
| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Service reachable | 200 | `{ healthy: true, statusCode: <code> }` |
| Service unreachable | 200 | `{ healthy: false, error: "Connection refused" }` |
| Preview not registered | 404 | Standard 404 error |
| Container not running | 500 | Standard 500 error |

---

## API Surface (Phase 7 Complete)

### Internal APIs (X-Internal-Service-Key Required)

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Execute command | POST | `/api/internal/sessions/:id/exec` |
| Read file | GET | `/api/internal/sessions/:id/files` |
| Write file | POST | `/api/internal/sessions/:id/files` |
| List directory | GET | `/api/internal/sessions/:id/dirs` |
| Stat file/dir | GET | `/api/internal/sessions/:id/stat` |
| Register preview port | POST | `/api/internal/sessions/:id/previews` |
| Internal preview proxy | ALL | `/internal-previews/proxy/:sessionId/*` |

### Public APIs (No Auth Required, Unless Access Control Enabled)

| Operation | Method | Endpoint | Access Control |
|-----------|--------|----------|----------------|
| Access preview | ALL | `/previews/:sessionId/*` | Optional (JWT) |
| Health check | GET | `/previews/:sessionId/health` | No |

---

## Security Model (Phase 7)

### Internal API Protection
- **Authentication**: X-Internal-Service-Key header required
- **Enforcement**: InternalServiceAuthGuard on all internal endpoints
- **Fail-Fast**: Missing/invalid key → 403 Forbidden
- **No Bypass**: All internal endpoints protected
- **Service Restart**: App fails to start if INTERNAL_SERVICE_KEY not set

### Public Preview Protection (Optional)
- **Default**: Public access (no authentication)
- **Opt-In**: JWT-based access control via ENABLE_PREVIEW_ACCESS_CONTROL
- **JWT Validation**: Standard jsonwebtoken library
- **Session Ownership**: Database query (sessions.user_id)
- **Enforcement**: Before HTTP and WebSocket upgrade
- **Error Responses**: 401 (invalid JWT), 403 (wrong user)

### Container Isolation
- **Docker Networking**: Containers on bridge network
- **IP-Based Routing**: Proxy uses container IP, not exposed ports
- **No Host Access**: Containers cannot access host network
- **Session Scoped**: Each session has isolated container
- **No Cross-Session Access**: Preview registration per session

### Path Validation (Filesystem)
- **No Traversal**: Rejects `..` in paths
- **Workspace Only**: All paths relative to /workspace
- **No Absolute Paths**: Rejects paths starting with /
- **No /workspace Prefix**: Paths must be relative

### WebSocket Security
- **Same as HTTP**: Access control enforced before upgrade
- **No New Attack Surface**: Uses same proxy mechanism
- **No Message Inspection**: Transparent frame forwarding
- **Connection Isolation**: Per-session container routing

---

## Known Limitations (Accepted at Phase 7 Boundary)

### Not Implemented

**Execution (7.1):**
- ❌ Background job execution
- ❌ Streaming stdout/stderr
- ❌ Interactive terminal (TTY)
- ❌ Signal handling (SIGTERM, SIGKILL)
- ❌ Resource limits (CPU, memory per exec)
- ❌ Concurrent execution limits
- ❌ Execution history or logs
- ❌ Public exec APIs

**Filesystem (7.2):**
- ❌ File deletion
- ❌ File rename or move
- ❌ Permission changes (chmod)
- ❌ Binary file support
- ❌ Large file streaming
- ❌ File locking
- ❌ Concurrency controls
- ❌ Public file APIs

**Preview (7.3-7.4):**
- ❌ Preview auto-cleanup on container stop
- ❌ Multiple ports per session
- ❌ Port conflict detection
- ❌ Database persistence of preview state
- ❌ Preview expiration / TTL
- ❌ Rate limiting
- ❌ Connection pooling
- ❌ Request/response logging
- ❌ Preview access audit trail
- ❌ Multi-user collaboration (shared previews)
- ❌ Custom domain support
- ❌ TLS termination
- ❌ Preview metrics/analytics
- ❌ Background health monitoring
- ❌ Health check caching
- ❌ Custom health check endpoints
- ❌ WebSocket reconnection logic
- ❌ Server-Sent Events (SSE) explicit support

**Resource Governance:**
- ❌ Usage tracking (exec count, bandwidth)
- ❌ Quota enforcement
- ❌ Billing integration
- ❌ Rate limiting
- ❌ Cost attribution
- ❌ Resource monitoring

**Lifecycle Management:**
- ❌ Container auto-stop on idle
- ❌ Workspace cleanup
- ❌ Preview de-registration on container stop
- ❌ Graceful shutdown handling
- ❌ Session expiration

---

## Assumptions Locked at Phase 7 Boundary

### Docker Environment
- **Bridge Network**: Containers accessible via bridge network IP
- **Network Reachability**: container-manager can reach all container IPs
- **No Custom Networking**: No NAT, firewall, or custom network rules
- **Socket Access**: Docker daemon accessible via DOCKER_HOST
- **Container Runtime**: Containers are persistent (not ephemeral)

### Trust Model
- **Internal Services**: Internal API callers are trusted
- **Docker Network**: Docker network is secure and isolated
- **No Malicious Requests**: Internal APIs don't validate beyond auth
- **Container Apps**: Container applications are user-controlled

### Operational Model
- **Single Service Instance**: No horizontal scaling of container-manager
- **In-Memory State**: Preview registrations lost on restart (accepted)
- **No HA**: Single point of failure (container-manager service)
- **Manual Operations**: No auto-scaling or auto-healing
- **Best-Effort**: No SLA guarantees

### HTTP/WebSocket
- **HTTP Only to Containers**: Containers serve HTTP, not HTTPS
- **WebSocket Works**: Dev servers support standard WebSocket protocol
- **No HTTP/2**: HTTP/1.1 only
- **No Custom Protocols**: Only HTTP and WebSocket

### JWT Compatibility
- **Standard JWT**: Uses jsonwebtoken library (HS256 default)
- **Payload Structure**: JWT must contain `sub` or `userId` field
- **Secret Sharing**: JWT_SECRET matches api-gateway
- **No Custom Claims**: Standard JWT validation only

### File Operations
- **UTF-8 Text**: All files assumed UTF-8 text
- **No Binary**: Binary files may corrupt
- **No Large Files**: No streaming, entire file in memory
- **Linux Paths**: POSIX-style paths only

---

## Phase 7 File Inventory

### New Files Created

**Phase 7.1 (Execution):**
- `services/container-manager/src/sessions/dto/exec.dto.ts`
- Modifications to `DockerRuntimeService` and `SessionsService`

**Phase 7.2 (Filesystem):**
- Modifications to `DockerRuntimeService` (read, write, list, stat methods)
- Modifications to `InternalSessionsController` (file endpoints)

**Phase 7.3 (Preview Registration & Proxy):**
- `services/container-manager/src/previews/preview.service.ts`
- `services/container-manager/src/previews/preview-proxy.service.ts`
- `services/container-manager/src/previews/internal-previews.controller.ts`
- `services/container-manager/src/previews/internal-previews-proxy.controller.ts`
- `services/container-manager/src/previews/previews.controller.ts`

**Phase 7.4 (Access Control, Health, WebSocket):**
- Modifications to `PreviewsController` (access control, health, WebSocket)
- `package.json` (added jsonwebtoken dependencies)
- `.env.example` (added access control configuration)

### Modified Files (Across Phase 7)
- `services/container-manager/src/docker/docker-runtime.service.ts`
- `services/container-manager/src/sessions/sessions.service.ts`
- `services/container-manager/src/sessions/internal-sessions.controller.ts`
- `services/container-manager/src/sessions/sessions.module.ts`
- `services/container-manager/src/previews/previews.controller.ts`
- `services/container-manager/package.json`
- `services/container-manager/.env.example`

### Unchanged (Frozen from Earlier Phases)
- All Phase 6 files (container lifecycle)
- Database schemas
- Client modules
- Guards (InternalServiceAuthGuard)
- Main application bootstrap

---

## Configuration (Phase 7)

### Environment Variables

**Core (Phase 6+):**
- `INTERNAL_SERVICE_KEY` - Shared secret for internal APIs
- `DOCKER_HOST` - Docker daemon socket (default: unix:///var/run/docker.sock)
- `PORT` - Container-manager service port (default: 4002)

**Preview Access Control (Phase 7.4A):**
- `ENABLE_PREVIEW_ACCESS_CONTROL` - Enable JWT-based access control (default: false)
- `JWT_SECRET` - JWT signing secret (must match api-gateway when enabled)

### Dependencies Added (Phase 7.4)
- `jsonwebtoken: ^9.0.2` - JWT verification library
- `@types/jsonwebtoken: ^9.0.5` - TypeScript types

### Dependencies Already Available
- `http-proxy-middleware: ^3.0.5` - HTTP/WebSocket proxy (Phase 7.3)
- `axios: ^1.13.2` - HTTP client for health checks (Phase 7.4B)
- `dockerode: ^4.0.2` - Docker API client (Phase 6+)

---

## Testing Checklist (Phase 7 Complete)

### Phase 7.1 - Execution
- ✅ Execute commands in container
- ✅ Capture stdout, stderr, exit code
- ✅ Support working directory
- ✅ Support environment variables
- ✅ Enforce timeout
- ✅ Return 403 without auth
- ✅ Return 500 for container errors

### Phase 7.2 - Filesystem
- ✅ Read file content
- ✅ Write file content (create/overwrite)
- ✅ List directory contents
- ✅ Stat file/directory
- ✅ Check existence without error
- ✅ Path validation (reject .., absolute paths)
- ✅ Return 400 for invalid paths
- ✅ Return 500 for runtime errors

### Phase 7.3 - Preview Registration & Routing
- ✅ Register preview port (1024-65535)
- ✅ Validate container running before registration
- ✅ Internal proxy to container IP
- ✅ Public proxy to container IP
- ✅ Path rewriting works
- ✅ Return 404 for unregistered
- ✅ Return 500 for not running
- ✅ Return 502 for proxy errors

### Phase 7.4 - Access Control, Health, WebSocket
- ✅ Public access when disabled (default)
- ✅ JWT validation when enabled
- ✅ Session ownership check
- ✅ Return 401 for invalid JWT
- ✅ Return 403 for wrong user
- ✅ Health check returns reachability
- ✅ Health check public (no auth)
- ✅ WebSocket upgrade works
- ✅ Vite HMR works
- ✅ Next.js Fast Refresh works
- ✅ Access control enforced before WebSocket upgrade

---

## Deployment Notes (Phase 7)

### Startup Requirements
- Docker daemon accessible
- INTERNAL_SERVICE_KEY configured
- Database accessible (sessions table for ownership checks)
- Containers on bridge network (default)

### Optional Configuration
- ENABLE_PREVIEW_ACCESS_CONTROL=true for production
- JWT_SECRET must match api-gateway when access control enabled

### Known Operational Considerations
- Preview registrations lost on service restart
- No automatic cleanup of stale registrations
- No health monitoring except on-demand checks
- No connection limits or rate limiting
- Access control disabled by default
- WebSocket connections are long-lived (expected)

### Logging
- Execution: Logs command, container ID, exit code
- Filesystem: Logs file operations and errors
- Preview: Logs registration, proxy requests, WebSocket upgrades
- Errors: Logs all failures with session ID and details

---

## Phase Boundary Statement

✅ **Phase 7 is COMPLETE and IMMUTABLE**

All execution and preview capabilities required for:
- Safe code execution in containers
- File operations within container workspaces
- Public preview access with optional security
- WebSocket support for dev servers
- Health monitoring of preview services

are now available, tested, and stable.

---

## Next Phase: Phase 8 — Resource Governance

**Not Started. Proposed scope:**

### Phase 8.1: Usage Tracking
- Track execution count per session/user
- Track bandwidth per session/user
- Track container uptime
- Store usage metrics in database

### Phase 8.2: Quota Enforcement
- Define quota limits (free tier, pro tier)
- Enforce execution count limits
- Enforce bandwidth limits
- Enforce concurrent session limits
- Return 429 (Too Many Requests) when quota exceeded

### Phase 8.3: Lifecycle Automation
- Container auto-stop on idle (configurable timeout)
- Workspace cleanup on session end
- Preview de-registration on container stop
- Session expiration handling

### Phase 8.4: Billing Integration
- Cost attribution per execution
- Cost attribution per bandwidth
- Cost attribution per container uptime
- Integration with billing service
- Usage reporting API

**Each new phase must not modify Phase 6, 7.1, 7.2, 7.3, or 7.4 guarantees.**

---

## Safe Resume Point

**Next Phase:** Phase 8 — Resource Governance

**Alternative Next Work:**
- Task 8.1A: Execution Usage Tracking
- Task 8.2A: Quota Limit Definitions
- Task 8.3A: Container Idle Detection
- Phase 9: Advanced Preview Features (SSE, custom domains, TLS)

**To Continue Work:**
1. Do NOT modify Phase 7 code (frozen)
2. Assume all execution and preview APIs are stable
3. Build on top, never inside, existing logic
4. Introduce new guarantees only in new phases
5. Review access control configuration before production deployment
6. Consider enabling ENABLE_PREVIEW_ACCESS_CONTROL for production

---

## Migration Notes

### Upgrading to Phase 7

**From Phase 6 to Phase 7:**
- No breaking changes to existing container lifecycle
- New internal APIs added (exec, filesystem, preview)
- No database migrations required
- No configuration changes required (optional access control)

**Configuration Changes:**
```bash
# Optional: Enable preview access control
ENABLE_PREVIEW_ACCESS_CONTROL=true
JWT_SECRET=your_jwt_secret_here  # Must match api-gateway
```

**Code Changes:**
- No code changes required for existing functionality
- Rebuild/restart service to pick up new features

### Production Deployment Recommendations

1. **Enable Access Control:**
   ```bash
   ENABLE_PREVIEW_ACCESS_CONTROL=true
   JWT_SECRET=<secure-secret-matching-api-gateway>
   ```

2. **Monitor Logs:**
   - Watch for WebSocket upgrade requests
   - Monitor proxy errors (502 responses)
   - Track preview registration patterns

3. **Network Configuration:**
   - Ensure Docker bridge network is default
   - Verify container-manager can reach container IPs
   - No firewall rules blocking inter-container traffic

4. **Security:**
   - Keep INTERNAL_SERVICE_KEY secure
   - Rotate JWT_SECRET periodically
   - Monitor for unauthorized access attempts

---

**END OF PHASE 7 CHECKPOINT**

Resume work by reviewing this checkpoint and confirming understanding before proceeding to Phase 8 or alternative next tasks.
