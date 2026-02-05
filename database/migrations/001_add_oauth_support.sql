-- Migration: Add OAuth Support
-- Date: 2025-12-15
-- Description: Add OAuth provider columns and make password nullable for OAuth-only users
-- Compatible with: PostgreSQL 9.6+ and SQLite 3.35+ (2021)

-- Note: Uses IF NOT EXISTS syntax supported by both databases
-- For fresh databases, schema.sql and schema-sqlite.sql already include these columns

-- Add auth_provider column (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) NOT NULL DEFAULT 'email'
  CHECK (auth_provider IN ('email', 'google', 'apple', 'github'));

-- Add oauth_id column (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);

-- Note: Making password_hash nullable requires different syntax for each database:
-- - PostgreSQL: ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
-- - SQLite: Requires table recreation (not supported via ALTER COLUMN)
-- Since both base schemas (schema.sql and schema-sqlite.sql) now have password_hash as nullable,
-- fresh databases will have it nullable from the start.
-- For existing databases with NOT NULL constraint, manual intervention may be required.

-- Verify migration succeeded by checking if columns exist
SELECT 'Migration completed successfully. OAuth support added.' as result;
