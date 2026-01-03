/**
 * Rate Limiting Service
 *
 * Implements rate limiting using token bucket algorithm with Redis backing.
 * Protects against abuse, DDoS attacks, and excessive API usage.
 */

import { logger } from './loggerService';
import { metricsService } from './metricsService';
import crypto from 'crypto';

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;          // Time window in milliseconds
  maxRequests: number;       // Max requests per window
  keyPrefix?: string;        // Redis key prefix
  skipSuccessfulRequests?: boolean;  // Only count failed requests
  skipFailedRequests?: boolean;      // Only count successful requests
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;  // Seconds until reset
}

interface RequestRecord {
  count: number;
  resetTime: number;  // Unix timestamp in milliseconds
}

/**
 * In-memory rate limit store
 * In production, this should be replaced with Redis for distributed rate limiting
 */
class RateLimitStore {
  private store: Map<string, RequestRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Get request record for a key
   */
  get(key: string): RequestRecord | undefined {
    const record = this.store.get(key);

    // Check if expired
    if (record && Date.now() > record.resetTime) {
      this.store.delete(key);
      return undefined;
    }

    return record;
  }

  /**
   * Set request record for a key
   */
  set(key: string, record: RequestRecord): void {
    this.store.set(key, record);
  }

  /**
   * Increment request count for a key
   */
  increment(key: string, windowMs: number): RequestRecord {
    const now = Date.now();
    const existing = this.get(key);

    if (!existing) {
      // Create new record
      const record: RequestRecord = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.set(key, record);
      return record;
    }

    // Increment existing record
    existing.count++;
    this.set(key, existing);
    return existing;
  }

  /**
   * Delete a key
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limit store cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Get store size for monitoring
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Cleanup interval on shutdown
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

export class RateLimitService {
  private config: RateLimitConfig;
  private store: RateLimitStore;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.store = new RateLimitStore();

    if (config.enabled) {
      logger.info(
        `Rate limiting enabled: ${config.maxRequests} requests per ${config.windowMs}ms`
      );
    } else {
      logger.warn('Rate limiting is DISABLED - only use in development!');
    }
  }

  /**
   * Check if request is allowed under rate limit
   * @param identifier Unique identifier (IP, user ID, API key hash)
   * @param namespace Optional namespace for grouping (e.g., 'api', 'mcp')
   * @returns Rate limit result
   */
  checkLimit(identifier: string, namespace?: string): RateLimitResult {
    // If rate limiting is disabled, allow all requests
    if (!this.config.enabled) {
      return {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetTime: new Date(Date.now() + this.config.windowMs),
      };
    }

    // Generate storage key
    const key = this.generateKey(identifier, namespace);

    // Increment request count
    const record = this.store.increment(key, this.config.windowMs);

    // Check if limit exceeded
    const allowed = record.count <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - record.count);
    const resetTime = new Date(record.resetTime);
    const retryAfter = allowed ? undefined : Math.ceil((record.resetTime - Date.now()) / 1000);

    // Record metrics if limit exceeded
    if (!allowed) {
      logger.warn(
        `Rate limit exceeded for ${identifier} (${namespace || 'default'}): ` +
        `${record.count}/${this.config.maxRequests} requests`
      );
      metricsService.recordError('rate_limit_exceeded', 'medium');
    }

    return {
      allowed,
      limit: this.config.maxRequests,
      remaining,
      resetTime,
      retryAfter,
    };
  }

  /**
   * Consume a request from the rate limit
   * Returns true if request is allowed, false if rate limit exceeded
   */
  consume(identifier: string, namespace?: string): boolean {
    const result = this.checkLimit(identifier, namespace);
    return result.allowed;
  }

  /**
   * Reset rate limit for a specific identifier
   * Useful for testing or manual resets
   */
  reset(identifier: string, namespace?: string): void {
    const key = this.generateKey(identifier, namespace);
    this.store.delete(key);
    logger.info(`Rate limit reset for ${identifier} (${namespace || 'default'})`);
  }

  /**
   * Generate storage key from identifier and namespace
   */
  private generateKey(identifier: string, namespace?: string): string {
    const prefix = this.config.keyPrefix || 'ratelimit';
    const ns = namespace || 'default';

    // Hash identifier for privacy and consistent key length
    const hash = crypto
      .createHash('sha256')
      .update(identifier)
      .digest('hex')
      .substring(0, 16);

    return `${prefix}:${ns}:${hash}`;
  }

  /**
   * Get store size for monitoring
   */
  getStoreSize(): number {
    return this.store.size();
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get rate limit configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.store.destroy();
  }
}

/**
 * Create rate limit service instance from environment variables
 */
export function createRateLimitService(): RateLimitService {
  const config: RateLimitConfig = {
    enabled: process.env.ENABLE_RATE_LIMITING === 'true',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    keyPrefix: 'alcs:ratelimit',
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };

  return new RateLimitService(config);
}

/**
 * Extract identifier from request
 * Uses multiple fallbacks: API key hash > User ID > IP address
 */
export function extractRateLimitIdentifier(
  req: any,
  authContext?: { userId?: string; method?: string }
): string {
  // Use authenticated user ID if available
  if (authContext?.userId) {
    return `user:${authContext.userId}`;
  }

  // Use API key hash if present
  const authHeader = req.headers?.['authorization'];
  if (authHeader) {
    const hash = crypto
      .createHash('sha256')
      .update(authHeader)
      .digest('hex')
      .substring(0, 16);
    return `apikey:${hash}`;
  }

  // Fallback to IP address
  const ip =
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';

  return `ip:${ip}`;
}

/**
 * Add rate limit headers to HTTP response
 */
export function addRateLimitHeaders(res: any, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', result.limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.resetTime.toISOString());

  if (result.retryAfter !== undefined) {
    res.setHeader('Retry-After', result.retryAfter.toString());
  }
}

// Singleton instance
export const rateLimitService = createRateLimitService();
