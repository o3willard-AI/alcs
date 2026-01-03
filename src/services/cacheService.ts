/**
 * Cache Service
 *
 * Provides response caching with Redis backing and in-memory fallback.
 * Improves performance by caching expensive operations.
 */

import { logger } from './loggerService';
import { metricsService } from './metricsService';
import crypto from 'crypto';

export interface CacheConfig {
  enabled: boolean;
  defaultTtl: number;        // Default TTL in seconds
  maxMemoryItems?: number;   // Max items in memory cache
  redisUrl?: string;         // Redis connection URL
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;         // Unix timestamp in milliseconds
  createdAt: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * In-memory cache store
 */
class MemoryCacheStore {
  private store: Map<string, CacheEntry<any>> = new Map();
  private maxItems: number;
  private hits: number = 0;
  private misses: number = 0;
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxItems: number = 1000) {
    this.maxItems = maxItems;

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    // Check if exists and not expired
    if (!entry || Date.now() > entry.expiresAt) {
      this.misses++;
      if (entry) {
        this.store.delete(key);
      }
      return null;
    }

    // Update hits
    entry.hits++;
    this.hits++;
    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    // Enforce max items by removing oldest
    if (this.store.size >= this.maxItems) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      createdAt: Date.now(),
      hits: 0,
    };

    this.store.set(key, entry);
  }

  /**
   * Delete value from cache
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Delete all keys matching pattern
   */
  deletePattern(pattern: string): number {
    let deleted = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
      logger.debug(`Cache evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Destroy cache and cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

export class CacheService {
  private config: CacheConfig;
  private memoryStore: MemoryCacheStore;
  private redisClient: any = null; // TODO: Add Redis client when needed

  constructor(config: CacheConfig) {
    this.config = config;
    this.memoryStore = new MemoryCacheStore(config.maxMemoryItems || 1000);

    if (config.enabled) {
      logger.info(`Cache service enabled (default TTL: ${config.defaultTtl}s)`);

      // TODO: Initialize Redis client if URL provided
      if (config.redisUrl) {
        logger.info('Redis caching will be available in future release');
        // this.initializeRedis(config.redisUrl);
      } else {
        logger.info('Using in-memory cache (not distributed)');
      }
    } else {
      logger.warn('Cache service is DISABLED');
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      // Try Redis first (if available)
      if (this.redisClient) {
        // TODO: Implement Redis get
        // const value = await this.redisClient.get(key);
        // if (value) return JSON.parse(value);
      }

      // Fallback to memory cache
      const value = this.memoryStore.get<T>(key);

      if (value !== null) {
        logger.debug(`Cache hit: ${key}`);
      } else {
        logger.debug(`Cache miss: ${key}`);
      }

      return value;
    } catch (error: any) {
      logger.error(`Cache get error for key ${key}: ${error.message}`);
      metricsService.recordError('cache_get_error', 'low');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const ttl = ttlSeconds ?? this.config.defaultTtl;

    try {
      // Set in Redis (if available)
      if (this.redisClient) {
        // TODO: Implement Redis set
        // await this.redisClient.setex(key, ttl, JSON.stringify(value));
      }

      // Always set in memory cache
      this.memoryStore.set(key, value, ttl);

      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error: any) {
      logger.error(`Cache set error for key ${key}: ${error.message}`);
      metricsService.recordError('cache_set_error', 'low');
    }
  }

  /**
   * Get or compute value
   * If value exists in cache, return it. Otherwise, compute it and cache it.
   */
  async getOrSet<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await computeFn();

    // Cache it
    await this.set(key, value, ttlSeconds);

    return value;
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Delete from Redis (if available)
      if (this.redisClient) {
        // TODO: Implement Redis delete
        // await this.redisClient.del(key);
      }

      // Delete from memory cache
      this.memoryStore.delete(key);

      logger.debug(`Cache delete: ${key}`);
    } catch (error: any) {
      logger.error(`Cache delete error for key ${key}: ${error.message}`);
      metricsService.recordError('cache_delete_error', 'low');
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }

    try {
      let deleted = 0;

      // Delete from Redis (if available)
      if (this.redisClient) {
        // TODO: Implement Redis pattern delete
        // const keys = await this.redisClient.keys(pattern);
        // if (keys.length > 0) {
        //   deleted += await this.redisClient.del(...keys);
        // }
      }

      // Delete from memory cache
      deleted += this.memoryStore.deletePattern(pattern);

      logger.info(`Cache deleted ${deleted} keys matching pattern: ${pattern}`);
      return deleted;
    } catch (error: any) {
      logger.error(`Cache delete pattern error: ${error.message}`);
      metricsService.recordError('cache_delete_error', 'low');
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Clear Redis (if available)
      if (this.redisClient) {
        // TODO: Implement Redis clear
        // await this.redisClient.flushdb();
      }

      // Clear memory cache
      this.memoryStore.clear();

      logger.info('Cache cleared');
    } catch (error: any) {
      logger.error(`Cache clear error: ${error.message}`);
      metricsService.recordError('cache_clear_error', 'medium');
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.memoryStore.getStats();
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Generate cache key from components
   */
  generateKey(...components: string[]): string {
    const prefix = 'alcs:cache';
    const joined = components.join(':');

    // Hash if too long
    if (joined.length > 200) {
      const hash = crypto
        .createHash('sha256')
        .update(joined)
        .digest('hex')
        .substring(0, 16);
      return `${prefix}:${hash}`;
    }

    return `${prefix}:${joined}`;
  }

  /**
   * Cache wrapper for functions
   */
  wrap<T>(
    cacheName: string,
    fn: (...args: any[]) => Promise<T>,
    ttlSeconds?: number
  ): (...args: any[]) => Promise<T> {
    return async (...args: any[]): Promise<T> => {
      // Generate cache key from function name and arguments
      const argsHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(args))
        .digest('hex')
        .substring(0, 16);

      const key = this.generateKey(cacheName, argsHash);

      return this.getOrSet(key, () => fn(...args), ttlSeconds);
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.memoryStore.destroy();

    if (this.redisClient) {
      // TODO: Close Redis connection
      // this.redisClient.quit();
    }
  }
}

/**
 * Create cache service instance from environment variables
 */
export function createCacheService(): CacheService {
  const config: CacheConfig = {
    enabled: process.env.ENABLE_CACHING === 'true',
    defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL || '300', 10), // 5 minutes
    maxMemoryItems: parseInt(process.env.CACHE_MAX_ITEMS || '1000', 10),
    redisUrl: process.env.REDIS_URL,
  };

  return new CacheService(config);
}

/**
 * Common cache key generators
 */
export const CacheKeys = {
  health: () => 'alcs:cache:health',
  projectStatus: (sessionId: string) => `alcs:cache:project_status:${sessionId}`,
  progressSummary: (sessionId: string) => `alcs:cache:progress_summary:${sessionId}`,
  repoMap: (repoPath: string) => {
    const hash = crypto.createHash('sha256').update(repoPath).digest('hex').substring(0, 16);
    return `alcs:cache:repo_map:${hash}`;
  },
  sessionPattern: (sessionId: string) => `alcs:cache:*:${sessionId}`,
};

// Singleton instance
export const cacheService = createCacheService();
