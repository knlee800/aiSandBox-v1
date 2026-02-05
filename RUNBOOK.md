# AI Sandbox Platform — Database Quick Reference

Quick command reference for database operations. For detailed docs, see [aiSandBox/database/README.md](aiSandBox/database/README.md).

---

## Test Database Connection

### Host Machine (Windows/Mac/Linux)

**One command:**
```bash
node database/test-connection.js
```

**Prerequisites:**
```bash
docker-compose up -d postgres
```

**Expected output:**
```
🧭 DB Mode: HOST (localhost:5432)

ℹ️  Running in HOST mode (for local development on Windows/Mac/Linux)
ℹ️  Make sure PostgreSQL is running: docker-compose up -d postgres

🔌 Connecting to database...
✅ Connected successfully!
📊 PostgreSQL version: PostgreSQL 15.x
📋 Total tables: X
```

---

### Inside Docker Container

**One command:**
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

---

### Production / Remote (DATABASE_URL)

**One command:**
```bash
DATABASE_URL=postgres://user:pass@host:5432/dbname node database/test-connection.js
```

**Expected output:**
```
🧭 DB Mode: DATABASE_URL (connection string)

✅ Using explicit DATABASE_URL (connection string mode)
ℹ️  No auto-detection — using exact connection string provided

🔌 Connecting to database...
```

---

## Common Issues

### Issue: "getaddrinfo ENOTFOUND postgres"

**Symptom:**
```
⚠️  DOCKER mode detected: Connecting to hostname "postgres" (Docker service name)
⚠️  This only works INSIDE a Docker container.
❌ Database connection test FAILED!
Error: getaddrinfo ENOTFOUND postgres
```

**Cause:** You have `POSTGRES_HOST=postgres` set, but you're running from your host machine (not inside Docker).

**Fix:**
```bash
# Linux/Mac
unset POSTGRES_HOST

# Windows PowerShell
$env:POSTGRES_HOST = $null

# Windows CMD
set POSTGRES_HOST=

# Then retry
node database/test-connection.js
```

---

### Issue: "Connection refused" on localhost

**Symptom:**
```
🧭 DB Mode: HOST (localhost:5432)
❌ Database connection test FAILED!
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause:** PostgreSQL is not running or not exposed on port 5432.

**Fix:**
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait 10 seconds for startup
sleep 10

# Verify it's running
docker ps | grep postgres

# Should show: 0.0.0.0:5432->5432/tcp

# Then retry
node database/test-connection.js
```

---

### Issue: Wrong database detected

**Symptom:** The script detects the wrong mode (e.g., DOCKER when you're on host).

**Debug:**
```bash
# Check environment variables
echo $POSTGRES_HOST        # Linux/Mac
echo %POSTGRES_HOST%       # Windows CMD
$env:POSTGRES_HOST         # Windows PowerShell

# Should be empty for host mode
# Should be "postgres" for Docker mode
```

**Fix:** Clear the environment variable (see commands above).

---

## SQLite (Development Alternative)

### Create SQLite Database

**One command:**
```bash
node database/test-sqlite.js
```

**Output:**
```
🔌 Creating SQLite database...
✅ Database file created!
📁 Location: /path/to/aiSandBox/database/aisandbox.db
```

### Run Migrations

**One command:**
```bash
node database/run-migrations.js
```

---

## Environment Variables Reference

| Variable | Default | Used By | Purpose |
|----------|---------|---------|---------|
| `DATABASE_URL` | (none) | All | Explicit connection string (overrides all) |
| `POSTGRES_HOST` | `localhost` | Host scripts | Hostname (use `postgres` in Docker) |
| `POSTGRES_PORT` | `5432` | All | Port number |
| `POSTGRES_USER` | `aisandbox` | All | Username |
| `POSTGRES_PASSWORD` | `aisandbox_dev_password_change_in_production` | All | Password |
| `POSTGRES_DB` | `aisandbox` | All | Database name |

**Priority:** `DATABASE_URL` > individual vars > defaults

---

## Quick Decision Tree

```
Do you have a DATABASE_URL?
├─ YES → Use: DATABASE_URL=... node database/test-connection.js
└─ NO → Are you inside a Docker container?
    ├─ YES → Use: POSTGRES_HOST=postgres node database/test-connection.js
    └─ NO → Use: node database/test-connection.js
```

---

## Related Documentation

- [aiSandBox/database/README.md](aiSandBox/database/README.md) — Full database documentation
- [CLAUDE.md](CLAUDE.md) — Project conventions and workflow
- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture
- [docker-compose.yml](aiSandBox/docker-compose.yml) — Service configuration

---

**Last updated:** Stage 3 (One-Command Confidence)
