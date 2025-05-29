import { MigrationService } from './migration.service';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  try {
    const migrationService = new MigrationService();
    
    // Run migrations
    await migrationService.runMigrations();
    
    // Get and display migration status
    const status = await migrationService.getMigrationStatus();
    console.log('\nMigration Status:');
    console.table(status);
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main(); 