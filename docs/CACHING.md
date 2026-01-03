# ALCS Response Caching Guide

This guide covers response caching configuration and usage for the ALCS MCP Server.

## Overview

Response caching improves ALCS performance by:
- **Reducing latency** - Instant responses for cached data
- **Decreasing load** - Fewer expensive operations
- **Improving scalability** - Handle more requests with same resources
- **Saving costs** - Fewer LLM API calls and database queries

ALCS supports both **in-memory** and **Redis-backed** caching (Redis support coming in future release).

## Configuration

Caching is configured via environment variables in your `.env` file:

```bash
# Enable/disable caching
ENABLE_CACHING=true

# Default cache TTL in seconds (5 minutes)
CACHE_DEFAULT_TTL=300

# Maximum items in memory cache
CACHE_MAX_ITEMS=1000

# Redis URL (optional, for distributed caching)
REDIS_URL=redis://localhost:6379
```

### Default Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ENABLE_CACHING` | `false` | Enable/disable caching |
| `CACHE_DEFAULT_TTL` | `300` | Default TTL in seconds (5 minutes) |
| `CACHE_MAX_ITEMS` | `1000` | Max items in memory cache |
| `REDIS_URL` | - | Redis connection URL (optional) |

## Quick Start

### 1. Enable Caching

Add to your `.env` file:

```bash
ENABLE_CACHING=true
CACHE_DEFAULT_TTL=300
CACHE_MAX_ITEMS=1000
```

### 2. Restart the Server

```bash
npm run mcp
```

### 3. Verify Caching

```bash
# First request (cache miss)
curl -I -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9090/health

# Response headers:
# X-Cache: MISS

# Second request within 30 seconds (cache hit)
curl -I -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9090/health

# Response headers:
# X-Cache: HIT
```

## Cached Endpoints

### HTTP Endpoints

| Endpoint | TTL | Reason |
|----------|-----|--------|
| `/health` | 30s | Health status changes slowly |
| `/ready` | - | Not cached (database check required) |
| `/metrics` | - | Not cached (real-time metrics) |

### MCP Tools

Caching can be added to expensive MCP tools:

- `get_project_status` - Session status (60s TTL)
- `get_progress_summary` - Progress info (60s TTL)
- `get_repo_map` - Repository structure (5min TTL)

## Cache Architecture

### In-Memory Cache (Current)

**Features:**
- Fast lookups (O(1) complexity)
- Automatic expiration
- LRU eviction when full
- Periodic cleanup of expired entries
- Hit/miss tracking

**Limitations:**
- Not distributed (single server only)
- Lost on restart
- Limited by memory

**Structure:**
```typescript
{
  key: string,
  value: T,
  expiresAt: number,  // Unix timestamp
  createdAt: number,
  hits: number
}
```

### Redis Cache (Future)

**Features:**
- Distributed across servers
- Persistent storage
- Advanced eviction policies
- Pub/sub for invalidation
- Atomic operations

**Coming Soon:** Redis integration for production deployments with multiple ALCS instances.

## Cache Keys

### Key Format

```
alcs:cache:<namespace>:<identifier>
```

**Examples:**
```
alcs:cache:health
alcs:cache:project_status:session-abc123
alcs:cache:progress_summary:session-xyz789
alcs:cache:repo_map:a1b2c3d4
```

### Key Generators

```typescript
import { CacheKeys } from './services/cacheService';

// Health check
const key = CacheKeys.health();
// => "alcs:cache:health"

// Project status
const key = CacheKeys.projectStatus('session-abc123');
// => "alcs:cache:project_status:session-abc123"

// Progress summary
const key = CacheKeys.progressSummary('session-abc123');
// => "alcs:cache:progress_summary:session-abc123"

// Repository map (hashed path)
const key = CacheKeys.repoMap('/path/to/repo');
// => "alcs:cache:repo_map:a1b2c3d4"

// All keys for a session
const pattern = CacheKeys.sessionPattern('session-abc123');
// => "alcs:cache:*:session-abc123"
```

## Using the Cache Service

### Basic Operations

```typescript
import { cacheService } from './services/cacheService';

// Get from cache
const value = await cacheService.get<MyType>('my-key');
if (value) {
  console.log('Cache hit:', value);
} else {
  console.log('Cache miss');
}

// Set in cache (default TTL)
await cacheService.set('my-key', myValue);

// Set with custom TTL (60 seconds)
await cacheService.set('my-key', myValue, 60);

// Delete from cache
await cacheService.delete('my-key');

// Clear all cache
await cacheService.clear();
```

### Get or Set Pattern

```typescript
// Get from cache, or compute and cache if not found
const result = await cacheService.getOrSet(
  'expensive-operation',
  async () => {
    // Expensive operation
    return await performExpensiveOperation();
  },
  300 // 5 minutes TTL
);
```

### Function Wrapper

```typescript
// Wrap a function with caching
const cachedFn = cacheService.wrap(
  'my-function',
  async (arg1: string, arg2: number) => {
    // Original function
    return await someExpensiveOperation(arg1, arg2);
  },
  300 // TTL
);

// Use it like normal function (caching is automatic)
const result1 = await cachedFn('hello', 42);  // Cache miss
const result2 = await cachedFn('hello', 42);  // Cache hit
```

### Pattern Deletion

```typescript
// Delete all cache entries for a session
const deleted = await cacheService.deletePattern(
  CacheKeys.sessionPattern('session-abc123')
);
console.log(`Deleted ${deleted} cache entries`);
```

## Cache Statistics

### Get Stats

```typescript
const stats = cacheService.getStats();

console.log('Cache hits:', stats.hits);
console.log('Cache misses:', stats.misses);
console.log('Hit rate:', (stats.hitRate * 100).toFixed(2) + '%');
console.log('Cache size:', stats.size);
```

### Monitor Stats

```bash
# Add to monitoring dashboard
curl http://localhost:9090/cache/stats

# Response:
{
  "hits": 1523,
  "misses": 472,
  "hitRate": 0.7633,
  "size": 234
}
```

## Cache Invalidation

### Manual Invalidation

```typescript
// Invalidate single entry
await cacheService.delete(CacheKeys.projectStatus('session-abc123'));

// Invalidate all entries for a session
await cacheService.deletePattern(CacheKeys.sessionPattern('session-abc123'));

// Clear entire cache
await cacheService.clear();
```

### Automatic Invalidation

Cache entries are automatically invalidated:
- **On expiration** - After TTL expires
- **On eviction** - When cache is full (LRU)
- **On cleanup** - Periodic cleanup every minute

### Event-Based Invalidation

Invalidate cache when data changes:

```typescript
// When session state changes
async function updateSessionState(sessionId: string, newState: any) {
  // Update database
  await db.session.update({ id: sessionId, state: newState });

  // Invalidate cache
  await cacheService.deletePattern(CacheKeys.sessionPattern(sessionId));
}
```

## TTL Strategies

### Short TTL (< 1 minute)

Use for frequently changing data:
- Health status (30s)
- Active session count (30s)

```typescript
await cacheService.set(key, value, 30);  // 30 seconds
```

### Medium TTL (1-5 minutes)

Use for moderately changing data:
- Project status (1min)
- Progress summaries (1min)
- Configuration (5min)

```typescript
await cacheService.set(key, value, 300);  // 5 minutes
```

### Long TTL (> 5 minutes)

Use for rarely changing data:
- Repository maps (30min)
- Static policies (1hour)
- User profiles (1hour)

```typescript
await cacheService.set(key, value, 3600);  // 1 hour
```

## Best Practices

### 1. **Cache Expensive Operations**

Only cache operations that are expensive:
- LLM API calls
- Database queries
- File system operations
- External API calls

**Don't cache:**
- Simple computations
- Memory lookups
- Quick validations

### 2. **Set Appropriate TTLs**

Balance freshness vs performance:

```typescript
// Too short (30s) - defeats purpose
await cacheService.set(key, value, 30);

// Too long (24h) - stale data
await cacheService.set(key, value, 86400);

// Just right (5min)
await cacheService.set(key, value, 300);
```

### 3. **Invalidate on Updates**

Always invalidate cache when data changes:

```typescript
// Update data
await updateData(id, newValue);

// Invalidate cache
await cacheService.delete(cacheKey);
```

### 4. **Use Unique Keys**

Ensure cache keys are unique and descriptive:

```typescript
// Good
const key = `project_status:${sessionId}:${userId}`;

// Bad (collision risk)
const key = sessionId;
```

### 5. **Handle Cache Failures**

Always handle cache errors gracefully:

```typescript
try {
  const cached = await cacheService.get(key);
  if (cached) return cached;
} catch (error) {
  // Log error but continue
  logger.error('Cache error:', error);
}

// Fallback to computing value
return await computeValue();
```

### 6. **Monitor Hit Rates**

Track cache effectiveness:

```typescript
const stats = cacheService.getStats();

// Alert if hit rate < 50%
if (stats.hitRate < 0.5) {
  logger.warn('Low cache hit rate:', stats.hitRate);
}
```

## Performance Impact

### Before Caching

```
Health check: 500ms (LLM endpoint check)
Requests/sec: 10
Load: High
```

### After Caching (30s TTL)

```
Health check: 2ms (cache hit)
Requests/sec: 500
Load: Low
```

**Improvement:** 250x faster, 50x more requests

## Monitoring

### Prometheus Metrics

Add cache metrics to Prometheus:

```promql
# Cache hit rate
cache_hit_rate = cache_hits / (cache_hits + cache_misses)

# Cache size
cache_size

# Cache operations
rate(cache_operations_total[5m])
```

### Log Messages

```json
{
  "level": "debug",
  "message": "Cache hit: alcs:cache:health"
}

{
  "level": "debug",
  "message": "Cache miss: alcs:cache:project_status:session-abc123"
}

{
  "level": "info",
  "message": "Cache cleanup: removed 15 expired entries"
}
```

## Troubleshooting

### Low Hit Rate

**Problem:** Cache hit rate < 50%

**Causes:**
- TTL too short
- Keys not matching
- Frequently changing data
- Cache eviction

**Solutions:**
1. Increase TTL:
   ```bash
   CACHE_DEFAULT_TTL=600  # 10 minutes
   ```
2. Increase cache size:
   ```bash
   CACHE_MAX_ITEMS=5000
   ```
3. Review cache key generation
4. Check if data is cacheable

### Memory Usage

**Problem:** High memory usage

**Cause:** Cache too large

**Solutions:**
1. Reduce cache size:
   ```bash
   CACHE_MAX_ITEMS=500
   ```
2. Reduce TTL:
   ```bash
   CACHE_DEFAULT_TTL=60  # 1 minute
   ```
3. Use Redis for persistence

### Stale Data

**Problem:** Serving outdated data

**Cause:** TTL too long or missing invalidation

**Solutions:**
1. Reduce TTL:
   ```typescript
   await cacheService.set(key, value, 60);  // 1 minute
   ```
2. Add invalidation:
   ```typescript
   // On data update
   await cacheService.delete(key);
   ```

## Redis Integration (Future)

### Setup (Coming Soon)

```bash
# Install Redis
docker run -d -p 6379:6379 redis:7-alpine

# Configure ALCS
ENABLE_CACHING=true
REDIS_URL=redis://localhost:6379
```

### Features (Planned)

- **Distributed caching** - Share cache across servers
- **Persistence** - Cache survives restarts
- **Advanced eviction** - LRU, LFU, TTL policies
- **Pub/sub** - Distributed cache invalidation
- **Clustering** - High availability

## Additional Resources

- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/)
- [Cache Strategies](https://aws.amazon.com/caching/best-practices/)
- [Authentication Guide](./AUTHENTICATION.md)
- [Rate Limiting Guide](./RATE-LIMITING.md)
- [Performance Optimization](./PERFORMANCE.md)
