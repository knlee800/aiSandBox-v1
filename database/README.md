# Database Setup and Migrations

## One-Command Guide

**I'm on my host machine (Windows/Mac/Linux) and want to test the database:**

```bash
# 1. Start PostgreSQL in Docker
docker-compose up -d postgres

# 2. Test connection
node database/test-connection.js
```

**Expected output:**
```
🧭 DB Mode: HOST (localhost:5432)

ℹ️  Running in HOST mode (for local development on Windows/Mac/Linux)
ℹ️  Make sure PostgreSQL is running: docker-compose up -d postgres

🔌 Connecting to database...
✅ Connected successfully!
```

**I'm inside a Docker container and want to test the database:**

```bash
POSTGRES_HOST=postgres node database/test-connection.js
```

**Expected output:**
```
🧭 DB Mode: DOCKER (postgres:5432)

⚠️  DOCKER mode detected: Connecting to hostname "postgres" (Docker service name)
⚠️  This only works INSIDE a Docker container.
...
```

**Common mistake detected:**

If you see this warning while running from your host machine:
```
⚠️  DOCKER mode detected: Connecting to hostname "postgres" (Docker service name)
⚠️  This only works INSIDE a Docker container.
⚠️  If running from your host machine, this will fail with "getaddrinfo ENOTFOUND postgres"

💡 Fix: Unset POSTGRES_HOST to use localhost:
   Linux/Mac: unset POSTGRES_HOST
   PowerShell: $env:POSTGRES_HOST = $null
   Windows CMD: set POSTGRES_HOST=
```

**You have `POSTGRES_HOST=postgres` set incorrectly. Follow the fix command above.**

---

## PostgreSQL Connection Testing (Host vs Docker)

### Test PostgreSQL Connection

```bash
cd aiSandBox
node database/test-connection.js
```

### Environment Detection

The script automatically detects where it's running:

**HOST Mode (User's Machine):**
```bash
node database/test-connection.js
# Output: 🧭 DB Mode: HOST (localhost:5432)
```
- No `POSTGRES_HOST` set → defaults to `localhost:5432`
- Used when running from Windows/Mac host machine
- Requires: `docker-compose up -d postgres` (exposes port 5432)

**DOCKER Mode (Inside Container):**
```bash
POSTGRES_HOST=postgres node database/test-connection.js
# Output: 🧭 DB Mode: DOCKER (postgres:5432)
```
- `POSTGRES_HOST=postgres` → uses Docker service name
- Used when running inside a Docker container
- Container-to-container networking

**DATABASE_URL Mode (Explicit Connection):**
```bash
DATABASE_URL=postgres://user:pass@host:5432/db node database/test-connection.js
# Output: 🧭 DB Mode: DATABASE_URL (connection string)
```
- Explicit connection string overrides all defaults
- Useful for production deployments

**CUSTOM Mode (Any Other Host):**
```bash
POSTGRES_HOST=192.168.1.100 node database/test-connection.js
# Output: 🧭 DB Mode: CUSTOM (192.168.1.100:5432)
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | (none) | Full connection string (overrides all) |
| `POSTGRES_HOST` | `localhost` | Database hostname |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_USER` | `aisandbox` | Database username |
| `POSTGRES_PASSWORD` | `aisandbox_dev_password_change_in_production` | Database password |
| `POSTGRES_DB` | `aisandbox` | Database name |

### Troubleshooting

**Connection refused (host mode):**
1. Check Docker is running: `docker ps`
2. Start PostgreSQL: `docker-compose up -d postgres`
3. Wait 10 seconds for startup
4. Verify port mapping: `docker ps | grep postgres` (should show `5432->5432`)

**Wrong host detected:**
- Unset `POSTGRES_HOST` for host mode: `unset POSTGRES_HOST` (Linux/Mac)
- Check environment: `echo $POSTGRES_HOST` (should be empty for host mode)

---

## SQLite Setup (Development Alternative)

## Initial Setup (Fresh Database)

To create a new database from scratch:

```bash
cd aiSandBox
node database/test-sqlite.js
```

This will:
- Create `database/aisandbox.db`
- Load the complete schema from `schema-sqlite.sql`
- Insert test user data
- Verify the database is working

**The schema includes all columns including termination tracking (Task 8.4A):**
- `sessions.terminated_at` (nullable TEXT)
- `sessions.termination_reason` (nullable TEXT)

---

## Migrations (Dual-Mode: SQLite + PostgreSQL)

The migration system supports both SQLite and PostgreSQL automatically.

### Running Migrations

```bash
cd aiSandBox
node database/run-migrations.js
```

**Environment Detection (Automatic):**

The migration script automatically detects which database to use:

| Condition | Database Mode | Output |
|-----------|--------------|--------|
| `DATABASE_URL` is set | PostgreSQL (connection string) | `🧭 Migration mode: POSTGRES (DATABASE_URL)` |
| `POSTGRES_HOST` is set | PostgreSQL (explicit host) | `🧭 Migration mode: POSTGRES (DOCKER/CUSTOM)` |
| No env vars set | SQLite (default) | `🧭 Migration mode: SQLITE` |

**Examples:**

```bash
# SQLite mode (default for local development)
node database/run-migrations.js

# PostgreSQL mode (HOST - from your machine)
# First start PostgreSQL: docker-compose up -d postgres
node database/run-migrations.js

# PostgreSQL mode (DOCKER - inside container)
POSTGRES_HOST=postgres node database/run-migrations.js

# PostgreSQL mode (DATABASE_URL - production)
DATABASE_URL=postgres://user:pass@host:5432/db node database/run-migrations.js
```

### How It Works

**SQLite Mode (Existing Behavior Preserved):**
- Connects to `database/aisandbox.db`
- Applies migrations/*.sql files in order
- Skips if "duplicate column" error (idempotent)
- No tracking table (error-based detection)

**PostgreSQL Mode (New):**
- Connects using `DATABASE_URL` or `POSTGRES_*` env vars
- Creates `_migrations_applied` tracking table
- Fresh database (no users table):
  - Applies complete `schema.sql`
  - Marks schema.sql as applied
  - Then applies migrations/*.sql
- Existing database:
  - Only applies unapplied migrations from migrations/*.sql
- Tracks applied migrations in `_migrations_applied` table
- Fully idempotent (safe to run multiple times)

**Current migrations:**
- `001_add_oauth_support.sql` - Adds OAuth authentication columns (SQLite only)
- `002_add_session_termination.sql` - Adds session termination tracking (Task 8.4A)

---

## Migration Workflow

### For Fresh Databases (Dev Setup)
1. Run `node database/test-sqlite.js` (includes all columns)
2. No migrations needed (schema is complete)

### For Existing Databases (Upgrade Path)
1. Run `node database/run-migrations.js`
2. Migrations are applied incrementally
3. Safe to run multiple times (idempotent)

### For Production
- Apply migrations before deploying new code
- Migrations are backwards-compatible
- Nullable columns don't break existing code

---

## Adding New Migrations

1. **Update schema-sqlite.sql** with new columns/tables
   - This ensures fresh databases have the complete schema

2. **Create migration file** in `database/migrations/`
   - Naming convention: `NNN_description.sql`
   - Example: `003_add_user_preferences.sql`

3. **Write idempotent SQL** that can be run multiple times
   - Use `ADD COLUMN IF NOT EXISTS` patterns
   - Or catch "duplicate column" errors

4. **Test migration**:
   ```bash
   node database/run-migrations.js
   ```

5. **Commit both files**:
   - `database/schema-sqlite.sql` (updated)
   - `database/migrations/NNN_description.sql` (new)

---

## Schema vs Migrations

**schema-sqlite.sql**
- Complete, authoritative schema
- Used for fresh database initialization
- Always includes all columns and tables
- Run via `test-sqlite.js`

**migrations/*.sql**
- Incremental changes only (ALTER TABLE, etc.)
- Used for upgrading existing databases
- Applied in order by filename
- Run via `run-migrations.js`

**Rule:** Always update both schema and migrations together.

---

## Task 8.4A: Session Termination Tracking

**Fresh Databases:**
- Columns already in `schema-sqlite.sql` (lines 47-48)
- No migration needed

**Existing Databases:**
- Run `node database/run-migrations.js`
- Applies `002_add_session_termination.sql`
- Adds `terminated_at` and `termination_reason` columns

**Verification:**
```bash
sqlite3 database/aisandbox.db "PRAGMA table_info(sessions);" | grep terminated
```

Expected output:
```
14|terminated_at|TEXT|0||0
15|termination_reason|TEXT|0||0
```

---

## Troubleshooting

**"Database file not found" when running migrations:**
- Run `node database/test-sqlite.js` first

**"duplicate column name" error:**
- Migration already applied (safe to ignore)
- Migration runner automatically skips these

**Schema mismatch between fresh DB and migrated DB:**
- Update `schema-sqlite.sql` to match final state
- Ensure migrations produce same result as schema

---

## DO NOT

❌ DO NOT apply schema changes in application code (SessionsService constructor, etc.)
❌ DO NOT run migrations in production without testing
❌ DO NOT delete old migration files (breaks upgrade path)
❌ DO NOT reorder or rename migration files

✅ DO use deterministic migration workflow
✅ DO test migrations on copy of production data
✅ DO keep schema and migrations in sync
✅ DO make migrations idempotent
