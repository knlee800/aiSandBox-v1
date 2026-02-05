-- AI Sandbox Platform - SQLite Schema (Development)
-- Version: 1.0 - SQLite adaptation

-- Note: SQLite doesn't support all PostgreSQL features, so we simplify:
-- - No UUID type (use TEXT)
-- - No ENUM types (use TEXT with CHECK constraints)
-- - No ARRAY types (use JSON)
-- - TIMESTAMPTZ becomes TEXT (ISO 8601 format)

-- ======================
-- CORE TABLES
-- ======================

-- Users and Authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- Nullable to support OAuth-only users
  auth_provider TEXT NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'apple', 'github')),
  oauth_id TEXT, -- Provider-specific user ID
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'beta')),
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
  stripe_customer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  preferred_language TEXT DEFAULT 'auto' CHECK (preferred_language IN ('english', 'cantonese', 'mixed', 'auto')),
  orchestrator_preference TEXT DEFAULT 'off' CHECK (orchestrator_preference IN ('off', 'lite', 'full')),
  expert_mode INTEGER DEFAULT 0
);

-- Sessions (one per active sandbox)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  container_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'stopped', 'expired', 'error')),
  git_initialized INTEGER DEFAULT 0,
  resource_limits TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
  last_activity_at TEXT DEFAULT (datetime('now')),
  metadata TEXT, -- JSON
  orchestrator_enabled INTEGER DEFAULT 0,
  orchestrator_mode TEXT DEFAULT 'off' CHECK (orchestrator_mode IN ('off', 'lite', 'full')),
  terminated_at TEXT, -- Task 8.4A: Nullable, set when session is terminated
  termination_reason TEXT -- Task 8.4A: Nullable, reason for termination (e.g., "max_lifetime", "idle_timeout", "manual")
);

-- Conversations (full chat history)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]', -- JSON array
  current_message_number INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Checkpoints (version control snapshots)
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_number INTEGER NOT NULL,
  git_commit_hash TEXT,
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('auto', 'manual', 'milestone')),
  description TEXT,
  files_changed INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER DEFAULT 0
);

-- Token Usage (critical for billing)
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_number INTEGER,
  model TEXT NOT NULL,
  ai_provider TEXT,
  ai_conversation_id TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  request_id TEXT
);

-- Projects (saved workspaces)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  storage_path TEXT,
  git_enabled INTEGER DEFAULT 1,
  archive_size_mb REAL,
  is_public INTEGER DEFAULT 0,
  fork_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_modified TEXT DEFAULT (datetime('now'))
);

-- Governance Events (Task 9.3A: Passive logging of governance terminations)
-- No foreign keys to avoid cascade complexity
-- Best-effort logging for observability and future billing/audit use
CREATE TABLE IF NOT EXISTS governance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id TEXT,
  termination_reason TEXT NOT NULL,
  terminated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'container-manager',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Invoices (Task 10B1: Invoice drafting for billing integration)
-- Task 10B2: Added nullable provider metadata columns
-- Task 11B: Added nullable void audit columns
-- Task 12B1: Added nullable finalization audit columns
-- No foreign keys to avoid cascade complexity
-- Idempotent draft creation using invoice_key
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_tokens INTEGER NOT NULL,
  total_cost_usd REAL NOT NULL,
  governance_events_total INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized', 'void')),
  payment_provider TEXT, -- Task 10B2: Provider name (e.g., 'stripe'), nullable
  provider_customer_id TEXT, -- Task 10B2: External customer ID, nullable
  provider_invoice_id TEXT, -- Task 10B2: External invoice ID, nullable
  voided_at TEXT, -- Task 11B: ISO 8601 timestamp when invoice was voided, nullable
  voided_by TEXT, -- Task 11B: Admin identifier who voided the invoice, nullable
  finalized_at TEXT, -- Task 12B1: ISO 8601 timestamp when invoice was finalized, nullable
  finalized_by TEXT, -- Task 12B1: Admin identifier who finalized the invoice, nullable
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_date ON token_usage(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session_msg ON checkpoints(session_id, message_number DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_governance_events_session ON governance_events(session_id);
CREATE INDEX IF NOT EXISTS idx_governance_events_user ON governance_events(user_id);

-- Task 9.3B: Indexes for usage aggregation and billing queries
CREATE INDEX IF NOT EXISTS idx_sessions_terminated_at ON sessions(terminated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_termination_reason ON sessions(termination_reason);
CREATE INDEX IF NOT EXISTS idx_governance_events_reason ON governance_events(termination_reason);
CREATE INDEX IF NOT EXISTS idx_governance_events_terminated_at ON governance_events(terminated_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(ai_provider);

-- Task 10B1: Indexes for invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_user_period ON invoices(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_key ON invoices(invoice_key);

-- Insert test user (password: "password123" - bcrypt hash)
INSERT OR IGNORE INTO users (id, email, password_hash, role, plan_type, is_active)
VALUES (
  'test-user-001',
  'test@aisandbox.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIBx8fBmyq',
  'admin',
  'enterprise',
  1
);
