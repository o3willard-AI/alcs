/**
 * Database Service
 *
 * Manages database connections, connection pooling, and provides
 * database operations with retry logic and error handling.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { logger } from './loggerService';
import { configManager } from './configService';

/**
 * Database Service Class
 * Singleton service for managing Prisma database connections
 */
export class DatabaseService {
  private prisma: PrismaClient | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private readonly maxConnectionAttempts: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor() {
    // Database config is not yet part of ServerConfig, using defaults
    // TODO: Add database configuration to ServerConfig interface
    this.maxConnectionAttempts = 3;
    this.initialDelayMs = 1000;
    this.maxDelayMs = 10000;
  }

  /**
   * Connect to the database with retry logic
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.prisma) {
      logger.debug('Database already connected');
      return;
    }

    logger.info('Connecting to database...');

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxConnectionAttempts; attempt++) {
      try {
        this.connectionAttempts = attempt;

        // Get database URL from environment (Prisma 7.x requirement)
        const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';

        // Create Prisma adapter for better-sqlite3 (Prisma 7.x requirement)
        const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

        // Create Prisma client with adapter (Prisma 7.x requirement)
        this.prisma = new PrismaClient({
          adapter,
          log: [
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
            { level: 'info', emit: 'event' },
          ],
        });

        // Set up logging
        (this.prisma as any).$on('error', (e: any) => {
          logger.error(`Prisma error: ${e.message}`);
        });

        (this.prisma as any).$on('warn', (e: any) => {
          logger.warn(`Prisma warning: ${e.message}`);
        });

        (this.prisma as any).$on('info', (e: any) => {
          logger.debug(`Prisma info: ${e.message}`);
        });

        // Test connection
        await this.prisma.$connect();

        // Verify connection with a simple query
        await this.prisma.$queryRaw`SELECT 1`;

        this.isConnected = true;
        logger.info(`Database connected successfully (attempt ${attempt}/${this.maxConnectionAttempts})`);
        return;
      } catch (error: any) {
        lastError = error;
        logger.warn(
          `Database connection attempt ${attempt}/${this.maxConnectionAttempts} failed: ${error.message}`
        );

        if (attempt < this.maxConnectionAttempts) {
          const delay = Math.min(
            this.initialDelayMs * Math.pow(2, attempt - 1),
            this.maxDelayMs
          );
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }

        // Clean up failed client
        if (this.prisma) {
          try {
            await this.prisma.$disconnect();
          } catch {
            // Ignore disconnect errors
          }
          this.prisma = null;
        }
      }
    }

    throw new Error(
      `Failed to connect to database after ${this.maxConnectionAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (!this.prisma) {
      logger.debug('Database not connected, nothing to disconnect');
      return;
    }

    logger.info('Disconnecting from database...');

    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      this.prisma = null;
      logger.info('Database disconnected successfully');
    } catch (error: any) {
      logger.error(`Error disconnecting from database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.prisma || !this.isConnected) {
      return false;
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error: any) {
      logger.error(`Database health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Prisma client instance
   * @throws Error if not connected
   */
  getClient(): PrismaClient {
    if (!this.prisma || !this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.prisma;
  }

  /**
   * Check if database is connected
   */
  isDbConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection stats
   */
  getConnectionStats() {
    return {
      connected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      maxAttempts: this.maxConnectionAttempts,
    };
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a function with automatic retry on transient errors
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'database operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxConnectionAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt >= this.maxConnectionAttempts) {
          throw error;
        }

        logger.warn(
          `${operationName} attempt ${attempt}/${this.maxConnectionAttempts} failed: ${error.message}`
        );

        const delay = Math.min(
          this.initialDelayMs * Math.pow(2, attempt - 1),
          this.maxDelayMs
        );
        logger.info(`Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable (transient)
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'P1001', // Can't reach database server
      'P1002', // Database server timeout
      'P1008', // Operations timed out
      'P1017', // Server has closed the connection
    ];

    return retryableErrors.some(
      (code) =>
        error.code === code ||
        error.message?.includes(code) ||
        error.meta?.code === code
    );
  }
}

/**
 * Singleton instance of the database service
 */
export const dbService = new DatabaseService();
