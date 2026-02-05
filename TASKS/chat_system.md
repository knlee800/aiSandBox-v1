# Chat System Tasks

## Task: Chat API Endpoints
- POST /api/chat/send
- GET /api/chat/history/:sessionId
- Priority: High
- Acceptance: Works with Claude API

## Task: Streaming Chat Responses
- SSE / WebSocket stream support
- Priority: Medium
- Acceptance: Client receives chunks live

## Task: Token Tracking for Chat
- Log tokens used per message
- Priority: Medium
- Acceptance: Token usage stored in DB

## Task: Chat UI Integration
- Integrate chat into frontend
- Priority: High
- Acceptance: Works with backend API
