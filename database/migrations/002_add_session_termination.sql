-- Migration: Add Session Termination Tracking
-- Date: 2026-01-26
-- Task: 8.4A
-- Description: Add terminated_at and termination_reason columns to sessions table
-- Compatible with: PostgreSQL 9.6+ and SQLite 3.35+ (2021)

-- Add terminated_at column (nullable datetime/text)
-- TEXT type works on both PostgreSQL and SQLite
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS terminated_at TEXT;

-- Add termination_reason column (nullable text)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- Verify migration
SELECT 'Migration completed successfully. Session termination tracking added.' as result;
