// Simple database connection test
// Run with: node database/test-connection.js
//
// ENVIRONMENT DETECTION:
// - HOST mode: Running from Windows/Mac host → defaults to localhost:5432
// - DOCKER mode: Running inside container → uses POSTGRES_HOST=postgres
// - DATABASE_URL mode: Explicit connection string overrides all

const { Client } = require('pg');

// Explicit environment detection
function detectEnvironment() {
  if (process.env.DATABASE_URL) {
    return { mode: 'DATABASE_URL', usingConnectionString: true };
  }

  const host = process.env.POSTGRES_HOST;

  if (!host) {
    // No POSTGRES_HOST set → Host execution (user's machine)
    return { mode: 'HOST', host: 'localhost' };
  }

  if (host === 'postgres') {
    // POSTGRES_HOST=postgres → Docker container execution
    return { mode: 'DOCKER', host: 'postgres' };
  }

  // Custom host specified explicitly
  return { mode: 'CUSTOM', host: host };
}

const env = detectEnvironment();
let config;

if (env.usingConnectionString) {
  config = { connectionString: process.env.DATABASE_URL };
  console.log('🧭 DB Mode: DATABASE_URL (connection string)');
} else {
  const port = process.env.POSTGRES_PORT || 5432;
  config = {
    host: env.host,
    port: port,
    user: process.env.POSTGRES_USER || 'aisandbox',
    password: process.env.POSTGRES_PASSWORD || 'aisandbox_dev_password_change_in_production',
    database: process.env.POSTGRES_DB || 'aisandbox',
  };
  console.log(`🧭 DB Mode: ${env.mode} (${env.host}:${port})`);
}

// Context-aware guidance (DX only, no behavior changes)
function printContextGuidance(env) {
  console.log(''); // Blank line for readability

  switch (env.mode) {
    case 'HOST':
      console.log('ℹ️  Running in HOST mode (for local development on Windows/Mac/Linux)');
      console.log('ℹ️  Make sure PostgreSQL is running: docker-compose up -d postgres');
      break;

    case 'DOCKER':
      console.log('⚠️  DOCKER mode detected: Connecting to hostname "postgres" (Docker service name)');
      console.log('⚠️  This only works INSIDE a Docker container.');
      console.log('⚠️  If running from your host machine, this will fail with "getaddrinfo ENOTFOUND postgres"');
      console.log('');
      console.log('💡 Fix: Unset POSTGRES_HOST to use localhost:');
      console.log('   Linux/Mac: unset POSTGRES_HOST');
      console.log('   PowerShell: $env:POSTGRES_HOST = $null');
      console.log('   Windows CMD: set POSTGRES_HOST=');
      break;

    case 'CUSTOM':
      console.log(`ℹ️  Using custom hostname: ${env.host}`);
      console.log('💡 For production, consider using DATABASE_URL instead:');
      console.log(`   DATABASE_URL=postgres://user:pass@${env.host}:5432/dbname`);
      break;

    case 'DATABASE_URL':
      console.log('✅ Using explicit DATABASE_URL (connection string mode)');
      console.log('ℹ️  No auto-detection — using exact connection string provided');
      break;
  }

  console.log(''); // Blank line before connection attempt
}

printContextGuidance(env);

async function testConnection() {
  const client = new Client(config);

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    console.log('✅ Connected successfully!');

    // Test query: Get database version
    const versionResult = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', versionResult.rows[0].version.split(',')[0]);

    // Test query: Count tables
    const tablesResult = await client.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('📋 Total tables:', tablesResult.rows[0].table_count);

    // Test query: Check if test user exists
    const userResult = await client.query(`
      SELECT email, role, plan_type
      FROM users
      WHERE email = 'test@aisandbox.com'
    `);

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log('👤 Test user found:');
      console.log('   Email:', user.email);
      console.log('   Role:', user.role);
      console.log('   Plan:', user.plan_type);
    } else {
      console.log('⚠️  Test user not found (run: npm run db:migrate)');
    }

    console.log('\n✅ Database connection test PASSED!');
    console.log('🎉 Ready to start building!');

  } catch (error) {
    console.error('❌ Database connection test FAILED!');
    console.error('Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('1. Make sure Docker is running: docker ps');
    console.error('2. Make sure database is up: npm run dev');
    console.error('3. Wait 10 seconds after starting, then try again');
    console.error('4. Check logs: docker-compose logs postgres');
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();
