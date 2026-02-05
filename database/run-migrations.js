#!/usr/bin/env node
// Dual-Mode Migration Runner (SQLite + PostgreSQL)
// Run with: node database/run-migrations.js
// Applies all pending migrations in the migrations/ folder

const fs = require('fs');
const path = require('path');

// ============================================
// ENVIRONMENT DETECTION
// ============================================

function detectDatabaseMode() {
  if (process.env.DATABASE_URL) {
    return { type: 'postgres', mode: 'DATABASE_URL' };
  }

  const host = process.env.POSTGRES_HOST;

  if (!host) {
    // No POSTGRES_HOST set → SQLite mode (default)
    return { type: 'sqlite', mode: 'SQLITE' };
  }

  // POSTGRES_HOST is set → PostgreSQL mode
  if (host === 'postgres') {
    return { type: 'postgres', mode: 'DOCKER' };
  }

  return { type: 'postgres', mode: 'CUSTOM' };
}

// ============================================
// SQLITE MIGRATION (Existing Behavior)
// ============================================

async function runSQLiteMigrations() {
  const Database = require('better-sqlite3');

  try {
    console.log('🧭 Migration mode: SQLITE');
    console.log('🔧 Running database migrations...\n');

    // Connect to database
    const dbPath = path.join(__dirname, 'aisandbox.db');

    if (!fs.existsSync(dbPath)) {
      console.error('❌ Database file not found!');
      console.error('📝 Please run: node database/test-sqlite.js');
      process.exit(1);
    }

    const db = new Database(dbPath);
    console.log('✅ Connected to database:', dbPath);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  No migrations folder found');
      db.close();
      process.exit(0);
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Sort to ensure order

    if (migrationFiles.length === 0) {
      console.log('✅ No migrations to run');
      db.close();
      process.exit(0);
    }

    console.log(`📋 Found ${migrationFiles.length} migration(s):\n`);

    // Run each migration
    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const migration = fs.readFileSync(filePath, 'utf-8');

      console.log(`   Running: ${file}`);

      try {
        db.exec(migration);
        console.log(`   ✅ Applied: ${file}\n`);
        appliedCount++;
      } catch (error) {
        if (error.message.includes('duplicate column')) {
          console.log(`   ⏭️  Skipped: ${file} (already applied)\n`);
          skippedCount++;
        } else {
          console.error(`   ❌ Failed: ${file}`);
          console.error(`   Error: ${error.message}\n`);
          throw error;
        }
      }
    }

    db.close();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Migration complete!`);
    console.log(`   Applied: ${appliedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${migrationFiles.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Migration FAILED!');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================
// POSTGRESQL MIGRATION (New)
// ============================================

async function runPostgresMigrations(mode) {
  const { Client } = require('pg');

  let client;
  let config;

  try {
    console.log(`🧭 Migration mode: POSTGRES (${mode})`);
    console.log('🔧 Running database migrations...\n');

    // Build connection config (same as test-connection.js)
    if (process.env.DATABASE_URL) {
      config = { connectionString: process.env.DATABASE_URL };
    } else {
      const host = process.env.POSTGRES_HOST || 'localhost';
      const port = process.env.POSTGRES_PORT || 5432;
      config = {
        host: host,
        port: port,
        user: process.env.POSTGRES_USER || 'aisandbox',
        password: process.env.POSTGRES_PASSWORD || 'aisandbox_dev_password_change_in_production',
        database: process.env.POSTGRES_DB || 'aisandbox',
      };
    }

    // Connect to database
    client = new Client(config);
    await client.connect();
    console.log('✅ Connected to database\n');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations_applied (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Check if database is fresh (no users table)
    const tableCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      ) as exists
    `);

    const isFreshDatabase = !tableCheckResult.rows[0].exists;

    if (isFreshDatabase) {
      console.log('📋 Fresh database detected. Applying base schema...\n');

      // Execute schema.sql
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        throw new Error('schema.sql not found!');
      }

      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(schema);
      console.log('✅ Base schema applied successfully\n');

      // Mark schema as applied
      await client.query(`
        INSERT INTO _migrations_applied (migration_name)
        VALUES ('schema.sql')
        ON CONFLICT (migration_name) DO NOTHING
      `);
    } else {
      console.log('📋 Existing database detected. Applying incremental migrations...\n');
    }

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  No migrations folder found');
      await client.end();
      process.exit(0);
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Sort to ensure order

    if (migrationFiles.length === 0) {
      console.log('✅ No migrations to run');
      await client.end();
      process.exit(0);
    }

    console.log(`📋 Found ${migrationFiles.length} migration file(s)\n`);

    // Run each migration
    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of migrationFiles) {
      // Check if already applied
      const checkResult = await client.query(
        'SELECT 1 FROM _migrations_applied WHERE migration_name = $1',
        [file]
      );

      if (checkResult.rows.length > 0) {
        console.log(`   ⏭️  Skipped: ${file} (already applied)`);
        skippedCount++;
        continue;
      }

      // Apply migration
      const filePath = path.join(migrationsDir, file);
      const migration = fs.readFileSync(filePath, 'utf-8');

      console.log(`   Running: ${file}`);

      try {
        // PostgreSQL migrations might have BEGIN/COMMIT in them, so use a single query
        await client.query(migration);

        // Mark as applied
        await client.query(
          'INSERT INTO _migrations_applied (migration_name) VALUES ($1)',
          [file]
        );

        console.log(`   ✅ Applied: ${file}\n`);
        appliedCount++;
      } catch (error) {
        console.error(`   ❌ Failed: ${file}`);
        console.error(`   Error: ${error.message}\n`);
        throw error;
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Migration complete!`);
    console.log(`   Applied: ${appliedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${migrationFiles.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Migration FAILED!');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// ============================================
// MAIN ENTRY POINT
// ============================================

async function main() {
  const dbConfig = detectDatabaseMode();

  if (dbConfig.type === 'sqlite') {
    await runSQLiteMigrations();
  } else {
    await runPostgresMigrations(dbConfig.mode);
  }
}

main();
