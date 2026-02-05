# Container Manager Tasks

## Task: Container Start/Stop Logic
- Implement start/stop API
- Priority: High
- Acceptance: Containers spin up/teardown reliably

## Task: Exec Command Execution
- POST /api/container/exec
- Priority: High
- Acceptance: Returns stdout/stderr

## Task: Container Log Streaming
- GET /api/container/logs/:sessionId
- Priority: Medium
- Acceptance: Logs available

## Task: Health Check Integration
- Container health & readiness probes
- Priority: Medium
- Acceptance: Backend reports health status
