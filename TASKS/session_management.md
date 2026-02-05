# Session Management Tasks

## Task: Define Session Entity & Schema
- Create database schema for Session table
- Fields: id, userId, containerId, runtimeType, status, timestamps
- Priority: High
- Acceptance: Migration + entity class created

## Task: Implement Session Creation API
- Endpoint: POST /api/sessions
- Create session + allocate container
- Priority: High
- Acceptance: Creates session with container metadata

## Task: Implement Session Fetch & List APIs
- GET /api/sessions/:id
- GET /api/sessions?userId=xxx&status=active
- Priority: High
- Acceptance: Returns valid session objects

## Task: Session Expiry & Cleanup
- Implement TTL, scheduled cleanup
- Priority: Medium
- Acceptance: Inactive sessions removed
