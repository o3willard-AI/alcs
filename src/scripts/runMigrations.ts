/**
 * Database Migrations Runner
 *
 * Runs Prisma migrations programmatically
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../services/loggerService.js';

const execAsync = promisify(exec);

/**
 * Run database migrations
 */
export async function runMigrations(deployMode: boolean = false): Promise<void> {
  logger.info('Running database migrations...');

  try {
    const command = deployMode ? 'npx prisma migrate deploy' : 'npx prisma migrate dev';

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      env: process.env,
    });

    if (stdout) {
      logger.info(`Migration output: ${stdout}`);
    }

    if (stderr && !stderr.includes('npx:')) {
      logger.warn(`Migration warnings: ${stderr}`);
    }

    logger.info('Database migrations completed successfully');
  } catch (error: any) {
    logger.error(`Failed to run migrations: ${error.message}`);
    if (error.stdout) {
      logger.error(`Migration stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      logger.error(`Migration stderr: ${error.stderr}`);
    }
    throw error;
  }
}

/**
 * Check migration status
 */
export async function checkMigrationStatus(): Promise<{
  pending: boolean;
  migrations: string[];
}> {
  logger.info('Checking migration status...');

  try {
    const { stdout } = await execAsync('npx prisma migrate status', {
      cwd: process.cwd(),
      env: process.env,
    });

    const pending = stdout.includes('following migration(s) have not yet been applied');
    const migrations: string[] = [];

    // Parse migration names from output
    if (pending) {
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('Migration name:')) {
          const migrationName = line.split(':')[1]?.trim();
          if (migrationName) {
            migrations.push(migrationName);
          }
        }
      }
    }

    logger.info(`Migration status: ${pending ? 'Pending' : 'Up to date'}`);
    if (migrations.length > 0) {
      logger.info(`Pending migrations: ${migrations.join(', ')}`);
    }

    return { pending, migrations };
  } catch (error: any) {
    logger.error(`Failed to check migration status: ${error.message}`);
    throw error;
  }
}

/**
 * Reset database (WARNING: Deletes all data)
 */
export async function resetDatabase(): Promise<void> {
  logger.warn('Resetting database - ALL DATA WILL BE LOST');

  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate reset --force', {
      cwd: process.cwd(),
      env: process.env,
    });

    if (stdout) {
      logger.info(`Reset output: ${stdout}`);
    }

    if (stderr) {
      logger.warn(`Reset warnings: ${stderr}`);
    }

    logger.info('Database reset completed');
  } catch (error: any) {
    logger.error(`Failed to reset database: ${error.message}`);
    throw error;
  }
}

// CLI execution
// Note: import.meta is not available in CommonJS output, so this check is commented out
// To run migrations, import and call the functions from another file
// or create a separate CLI entry point
/*
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];

  (async () => {
    try {
      if (mode === 'status') {
        await checkMigrationStatus();
      } else if (mode === 'reset') {
        await resetDatabase();
      } else if (mode === 'deploy') {
        await runMigrations(true);
      } else {
        await runMigrations(false);
      }
    } catch (error: any) {
      logger.error(`Migration script failed: ${error.message}`);
      process.exit(1);
    }
  })();
}
*/
