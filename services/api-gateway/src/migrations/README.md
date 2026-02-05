# Database Migrations

## Overview

This directory contains TypeORM migrations for the API Gateway database schema.

**Important:** `synchronize: false` is enforced in production. All schema changes must be applied via migrations.

## Initial Migration

**File:** `1769160618009-InitSchema20260123.ts`

Creates the complete initial database schema for all entities:

### Tables Created

1. **users** - User accounts with authentication
   - Columns: id, email, password_hash, role, created_at
   - Indexes: idx_user_email, idx_user_role

2. **sessions** - Sandbox sessions with container tracking
   - Columns: id, status, container_id, created_at, expires_at, last_activity_at, user_id
   - Foreign Key: user_id → users.id (CASCADE)
   - Indexes: idx_session_status, idx_session_expires_at, idx_session_user_id

3. **conversations** - Chat timelines (1:1 with sessions)
   - Columns: id, session_id, messages_count, created_at, updated_at
   - Foreign Key: session_id → sessions.id (CASCADE)
   - Indexes: idx_conversation_session_id (UNIQUE)

4. **chat_messages** - Individual messages within conversations
   - Columns: id, conversation_id, role, content, tokens_used, created_at
   - Foreign Key: conversation_id → conversations.id (CASCADE)
   - Indexes: idx_chat_message_conversation_id, idx_chat_message_created_at

5. **git_checkpoints** - Git commit tracking for version control
   - Columns: id, session_id, commit_hash, message_number, description, files_changed, created_at
   - Foreign Key: session_id → sessions.id (CASCADE)
   - Indexes: idx_git_checkpoint_session_id, idx_git_checkpoint_commit_hash, idx_git_checkpoint_created_at

6. **containers** - Docker container metadata (1:1 with sessions)
   - Columns: id, session_id, container_name, image, status, cpu_limit, memory_limit_mb, created_at, started_at, stopped_at
   - Foreign Key: session_id → sessions.id (CASCADE)
   - Indexes: idx_container_session_id (UNIQUE), idx_container_name (UNIQUE), idx_container_status

7. **token_usage** - Token consumption ledger for billing
   - Columns: id, session_id, conversation_id, chat_message_id, model, input_tokens, output_tokens, total_tokens, created_at
   - Foreign Key: session_id → sessions.id (RESTRICT - preserves billing records)
   - Indexes: idx_token_usage_session_id, idx_token_usage_conversation_id, idx_token_usage_chat_message_id, idx_token_usage_model, idx_token_usage_created_at

### Enums Created

- **user_role**: user, admin
- **session_status**: pending, active, stopped, expired, error
- **chat_message_role**: user, assistant, system
- **container_status**: creating, running, stopped, error

## Running Migrations

### Apply migrations (when ready)
```bash
npm run migration:run
```

### Revert last migration
```bash
npm run migration:revert
```

### Show migration status
```bash
npm run migration:show
```

## Notes

- Migration has been created but **not yet applied**
- PostgreSQL database must be running before applying
- Ensure environment variables are set (POSTGRES_HOST, POSTGRES_USER, etc.)
- First run will create all tables from scratch
