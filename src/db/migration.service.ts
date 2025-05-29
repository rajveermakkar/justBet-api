import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);

export class MigrationService {
  private pool: Pool;
  private migrationsDir: string;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT),
    });
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  private async createMigrationsTable(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          type VARCHAR(50) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(20) NOT NULL DEFAULT 'completed',
          error TEXT,
          CHECK (type IN ('schema', 'data')),
          CHECK (status IN ('pending', 'completed', 'failed'))
        );
      `);
    } finally {
      client.release();
    }
  }

  private async getExecutedMigrations(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT name FROM migrations WHERE status = $1',
        ['completed']
      );
      return rows.map(row => row.name);
    } finally {
      client.release();
    }
  }

  private async executeMigration(
    client: any,
    migrationName: string,
    migrationSQL: string,
    type: 'schema' | 'data'
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      // Insert migration record as pending
      await client.query(
        `INSERT INTO migrations (name, type, status) 
         VALUES ($1, $2, 'pending')`,
        [migrationName, type]
      );

      // Execute migration
      await client.query(migrationSQL);

      // Update migration status to completed
      await client.query(
        `UPDATE migrations 
         SET status = 'completed' 
         WHERE name = $1`,
        [migrationName]
      );

      await client.query('COMMIT');
      console.log(`✓ Completed migration: ${migrationName}`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      
      // Update migration status to failed
      await client.query(
        `UPDATE migrations 
         SET status = 'failed', error = $1 
         WHERE name = $2`,
        [error.message, migrationName]
      );
      
      throw error;
    }
  }

  private async runSchemaMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const schemaDir = path.join(this.migrationsDir, 'schema');
      const files = await readdir(schemaDir);
      const schemaFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      const executedMigrations = await this.getExecutedMigrations();

      for (const file of schemaFiles) {
        if (!executedMigrations.includes(file)) {
          console.log(`Running schema migration: ${file}`);
          const migrationPath = path.join(schemaDir, file);
          const migrationSQL = await readFile(migrationPath, 'utf8');
          await this.executeMigration(client, file, migrationSQL, 'schema');
        }
      }
    } finally {
      client.release();
    }
  }

  private async runDataMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const dataDir = path.join(this.migrationsDir, 'data');
      const files = await readdir(dataDir);
      const dataFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      const executedMigrations = await this.getExecutedMigrations();

      for (const file of dataFiles) {
        if (!executedMigrations.includes(file)) {
          console.log(`Running data migration: ${file}`);
          const migrationPath = path.join(dataDir, file);
          const migrationSQL = await readFile(migrationPath, 'utf8');
          await this.executeMigration(client, file, migrationSQL, 'data');
        }
      }
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    try {
      console.log('Starting database migrations...');
      
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();

      // Run schema migrations first
      await this.runSchemaMigrations();

      // Then run data migrations
      await this.runDataMigrations();

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }

  async getMigrationStatus(): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT name, type, status, executed_at, error 
         FROM migrations 
         ORDER BY executed_at DESC`
      );
      return rows;
    } finally {
      client.release();
      await this.pool.end();
    }
  }
} 