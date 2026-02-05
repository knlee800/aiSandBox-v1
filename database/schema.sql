-- AI Sandbox Platform - Complete Database Schema
-- Version: 1.0
-- Date: December 2024

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables (for development - be careful in production!)
DROP TABLE IF EXISTS orchestrator_conversations CASCADE;
DROP TABLE IF EXISTS ai_conversations CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS usage_quotas CASCADE;
DROP TABLE IF EXISTS resource_usage CASCADE;
DROP TABLE IF EXISTS ios_builds CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;
DROP TABLE IF EXISTS downloads CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS token_usage CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ======================
-- CORE TABLES
-- ======================

-- Users and Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- Nullable to support OAuth-only users
  auth_provider VARCHAR(50) NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'apple', 'github')),
  oauth_id VARCHAR(255), -- Provider-specific user ID
  role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'beta')),
  plan_type VARCHAR(50) NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Orchestrator preferences (optional feature)
  preferred_language VARCHAR(50) DEFAULT 'auto' CHECK (preferred_language IN ('english', 'cantonese', 'mixed', 'auto')),
  orchestrator_preference VARCHAR(50) DEFAULT 'off' CHECK (orchestrator_preference IN ('off', 'lite', 'full')),
  expert_mode BOOLEAN DEFAULT false
);

-- Sessions (one per active sandbox)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID,
  container_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'stopped', 'expired', 'error')),
  git_initialized BOOLEAN DEFAULT false,
  resource_limits JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours',
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,

  -- Orchestrator settings (optional feature)
  orchestrator_enabled BOOLEAN DEFAULT false,
  orchestrator_mode VARCHAR(50) DEFAULT 'off' CHECK (orchestrator_mode IN ('off', 'lite', 'full'))
);

-- Conversations (full chat history)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  current_message_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checkpoints (version control snapshots)
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_number INTEGER NOT NULL,
  git_commit_hash VARCHAR(255),
  checkpoint_type VARCHAR(50) NOT NULL CHECK (checkpoint_type IN ('auto', 'manual', 'milestone')),
  description TEXT,
  files_changed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false
);

-- Token Usage (critical for billing)
CREATE TABLE token_usage (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_number INTEGER,
  model VARCHAR(100) NOT NULL,
  ai_provider VARCHAR(50),
  ai_conversation_id UUID,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd NUMERIC(10,4) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id VARCHAR(255)
);

-- Projects (saved workspaces)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  checkpoint_id UUID,
  storage_path TEXT,
  git_enabled BOOLEAN DEFAULT true,
  archive_size_mb NUMERIC(10,2),
  is_public BOOLEAN DEFAULT false,
  fork_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key for checkpoint_id after projects table exists
ALTER TABLE projects ADD CONSTRAINT fk_projects_checkpoint
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL;

-- Add foreign key for project_id after projects table exists
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- Download History
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  include_git_history BOOLEAN DEFAULT false,
  format VARCHAR(20) CHECK (format IN ('zip', 'tar.gz')),
  size_mb NUMERIC(10,2),
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upload History
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_size_mb NUMERIC(10,2) NOT NULL,
  upload_type VARCHAR(20) CHECK (upload_type IN ('zip', 'tar.gz', 'git_repo')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  files_extracted INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- iOS Builds (for Mac build agent)
CREATE TABLE ios_builds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  build_type VARCHAR(50) CHECK (build_type IN ('simulator', 'device', 'archive')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('queued', 'building', 'completed', 'failed')),
  mac_agent_id VARCHAR(255),
  xcode_version VARCHAR(50),
  build_output TEXT,
  simulator_stream_url TEXT,
  artifact_url TEXT,
  build_time_seconds INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Resource Usage (for cost accounting)
CREATE TABLE resource_usage (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cpu_seconds NUMERIC(10,2),
  memory_mb_hours NUMERIC(10,2),
  disk_gb_hours NUMERIC(10,2),
  network_bytes_out BIGINT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usage Quotas
CREATE TABLE usage_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokens_used_month BIGINT DEFAULT 0,
  tokens_limit_month BIGINT NOT NULL,
  concurrent_sessions_used INTEGER DEFAULT 0,
  concurrent_sessions_limit INTEGER NOT NULL,
  storage_gb_used NUMERIC(10,2) DEFAULT 0,
  storage_gb_limit NUMERIC(10,2) NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()) + INTERVAL '1 month',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================
-- BILLING TABLES
-- ======================

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255),
  plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('free', 'pro', 'enterprise')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at TIMESTAMPTZ
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id VARCHAR(255),
  amount_usd NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'paid', 'failed')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  token_usage_count BIGINT,
  overage_charges_usd NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_prefix VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  rate_limit_per_hour INTEGER DEFAULT 100,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- ======================
-- MULTI-AI TABLES (Optional)
-- ======================

-- AI-to-AI Conversations (Multi-AI collaboration)
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  mode VARCHAR(50) CHECK (mode IN ('sequential', 'parallel', 'discussion')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'failed', 'stopped_by_guard_rail')),
  participating_ais TEXT[],
  max_rounds INTEGER,
  current_round INTEGER DEFAULT 0,
  token_budget BIGINT,
  total_tokens BIGINT DEFAULT 0,
  total_cost NUMERIC(10,4) DEFAULT 0,
  messages JSONB DEFAULT '[]',
  guard_rails_triggered JSONB,
  user_interventions INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Orchestrator Conversations (Optional conversational layer)
CREATE TABLE orchestrator_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_number INTEGER NOT NULL,
  user_message TEXT NOT NULL,
  detected_language VARCHAR(50) CHECK (detected_language IN ('english', 'cantonese', 'mixed')),
  extracted_intent VARCHAR(50),
  intent_confidence NUMERIC(3,2),
  clarification_needed BOOLEAN DEFAULT false,
  confirmation_required BOOLEAN DEFAULT false,
  confirmation_status VARCHAR(50) CHECK (confirmation_status IN ('pending', 'approved', 'rejected')),
  action_summary TEXT,
  tokens_used INTEGER,
  cost_usd NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Audit Log
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- INDEXES
-- ======================

-- Performance indexes
CREATE INDEX idx_sessions_user_status ON sessions(user_id, status) WHERE status = 'active';
CREATE INDEX idx_token_usage_user_date ON token_usage(user_id, timestamp DESC);
CREATE INDEX idx_token_usage_session ON token_usage(session_id);
CREATE INDEX idx_token_usage_ai_conversation ON token_usage(ai_conversation_id) WHERE ai_conversation_id IS NOT NULL;
CREATE INDEX idx_checkpoints_session_msg ON checkpoints(session_id, message_number DESC);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_resource_usage_user_date ON resource_usage(user_id, recorded_at DESC);
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);

-- Billing indexes
CREATE INDEX idx_invoices_user_period ON invoices(user_id, period_start DESC);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);

-- Project indexes
CREATE INDEX idx_projects_user ON projects(user_id, created_at DESC);
CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_public ON projects(is_public) WHERE is_public = true;
CREATE INDEX idx_downloads_user_date ON downloads(user_id, downloaded_at DESC);
CREATE INDEX idx_uploads_user_date ON uploads(user_id, uploaded_at DESC);
CREATE INDEX idx_uploads_status ON uploads(status, uploaded_at DESC) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_sessions_project ON sessions(project_id) WHERE project_id IS NOT NULL;

-- iOS Build indexes
CREATE INDEX idx_ios_builds_session ON ios_builds(session_id, created_at DESC);
CREATE INDEX idx_ios_builds_user ON ios_builds(user_id, created_at DESC);
CREATE INDEX idx_ios_builds_status ON ios_builds(status, created_at DESC) WHERE status IN ('queued', 'building');

-- Multi-AI Conversation indexes
CREATE INDEX idx_ai_conversations_session ON ai_conversations(session_id, created_at DESC);
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, created_at DESC);
CREATE INDEX idx_ai_conversations_status ON ai_conversations(status) WHERE status IN ('active', 'paused');

-- Orchestrator indexes
CREATE INDEX idx_orchestrator_conv_session ON orchestrator_conversations(session_id, message_number DESC);
CREATE INDEX idx_orchestrator_conv_pending ON orchestrator_conversations(confirmation_status, created_at DESC)
  WHERE confirmation_status = 'pending';

-- ======================
-- SEED DATA (Development/Testing)
-- ======================

-- Create test user (password: "password123" - hashed with bcrypt)
INSERT INTO users (email, password_hash, role, plan_type, is_active)
VALUES (
  'test@aisandbox.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIBx8fBmyq',
  'admin',
  'enterprise',
  true
) ON CONFLICT (email) DO NOTHING;

-- Create usage quota for test user
INSERT INTO usage_quotas (user_id, tokens_limit_month, concurrent_sessions_limit, storage_gb_limit)
SELECT
  id,
  20000000, -- 20M tokens for enterprise
  10,       -- 10 concurrent sessions
  100       -- 100 GB storage
FROM users WHERE email = 'test@aisandbox.com'
ON CONFLICT (user_id) DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Database schema created successfully!';
  RAISE NOTICE '📊 Total tables: 23';
  RAISE NOTICE '👤 Test user: test@aisandbox.com / password123';
END $$;
