import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Database configuration for TypeORM
 * Connects to PostgreSQL container defined in docker-compose.yml
 */
export const databaseConfig = (): TypeOrmModuleOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Host resolution: explicit env var > environment-aware default
  const host = process.env.POSTGRES_HOST ?? (isDevelopment ? 'localhost' : 'postgres');
  console.log(`[DB CONFIG] host=${host}, env=${process.env.NODE_ENV}`);

  return {
    type: 'postgres',
    host,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'aisandbox',
    password: process.env.POSTGRES_PASSWORD || 'aisandbox_dev_password_change_in_production',
    database: process.env.POSTGRES_DB || 'aisandbox',

    // Auto-load entities from the entities directory
    // Pattern will match: src/**/*.entity{.ts,.js}
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],

    // Synchronize: false (required by task spec)
    // Migrations should be used instead
    synchronize: false,

    // Enable logging in development for debugging
    logging: !isProduction,

    // Connection pool settings
    extra: {
      max: 10, // Maximum pool connections
      idleTimeoutMillis: 30000, // Close idle connections after 30s
    },
  };
};
