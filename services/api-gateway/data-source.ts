import { DataSource } from 'typeorm';
import { join } from 'path';

/**
 * TypeORM DataSource for CLI migrations
 * This file is used by TypeORM CLI to generate and run migrations
 * Separate from runtime config to avoid circular dependencies
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'aisandbox',
  password: process.env.POSTGRES_PASSWORD || 'aisandbox_dev_password_change_in_production',
  database: process.env.POSTGRES_DB || 'aisandbox',

  // Load all entity files
  entities: [join(__dirname, 'src/**/*.entity{.ts,.js}')],

  // Migrations directory
  migrations: [join(__dirname, 'src/migrations/*{.ts,.js}')],

  // Disable synchronize (use migrations instead)
  synchronize: false,

  // Enable logging for migration operations
  logging: true,
});
