// SQLite database connection test
// Run with: node database/test-sqlite.js

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

async function testConnection() {
  try {
    console.log('🔌 Creating SQLite database...');

    // Create database file
    const dbPath = path.join(__dirname, 'aisandbox.db');
    const db = new Database(dbPath);

    console.log('✅ Database file created!');
    console.log('📁 Location:', dbPath);

    // Read and execute schema
    console.log('📋 Loading schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema-sqlite.sql'), 'utf-8');
    db.exec(schema);

    console.log('✅ Schema loaded successfully!');

    // Test query: Count tables
    const tablesResult = db.prepare(`
      SELECT COUNT(*) as table_count
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).get();

    console.log('📊 Total tables:', tablesResult.table_count);

    // Test query: Check if test user exists
    const userResult = db.prepare(`
      SELECT email, role, plan_type
      FROM users
      WHERE email = ?
    `).get('test@aisandbox.com');

    if (userResult) {
      console.log('👤 Test user found:');
      console.log('   Email:', userResult.email);
      console.log('   Role:', userResult.role);
      console.log('   Plan:', userResult.plan_type);
    } else {
      console.log('⚠️  Test user not found');
    }

    // Show database info
    const dbSize = fs.statSync(dbPath).size;
    console.log('💾 Database size:', (dbSize / 1024).toFixed(2), 'KB');

    console.log('\n✅ Database test PASSED!');
    console.log('🎉 Ready to start building!');
    console.log('\n📝 Note: Using SQLite for development. Will use PostgreSQL on QNAP.');

    db.close();

  } catch (error) {
    console.error('❌ Database test FAILED!');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testConnection();
