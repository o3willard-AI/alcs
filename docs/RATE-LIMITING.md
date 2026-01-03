# ALCS Rate Limiting Guide

This guide covers rate limiting configuration and usage for the ALCS MCP Server.

## Overview

Rate limiting protects your ALCS server from:
- **Abuse** - Prevents excessive API usage
- **DDoS attacks** - Mitigates distributed denial of service
- **Resource exhaustion** - Protects server resources
- **Brute force attacks** - Slows down credential guessing

ALCS uses a **token bucket algorithm** with configurable limits per time window.

## Configuration

Rate limiting is configured via environment variables in your `.env` file:

```bash
# Enable/disable rate limiting
ENABLE_RATE_LIMITING=true

# Maximum requests per time window
RATE_LIMIT_MAX_REQUESTS=100

# Time window in milliseconds (default: 15 minutes)
RATE_LIMIT_WINDOW_MS=900000
```

### Default Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ENABLE_RATE_LIMITING` | `false` | Enable/disable rate limiting |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Time window (15 minutes) |

## Quick Start

### 1. Enable Rate Limiting

Add to your `.env` file:

```bash
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### 2. Restart the Server

```bash
npm run mcp
```

### 3. Verify Rate Limiting

```bash
# Check rate limit headers
curl -I -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9090/health

# Response headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
# X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

## How It Works

### Token Bucket Algorithm

ALCS uses a token bucket algorithm:

1. **Each client** gets a bucket of tokens
2. **Each request** consumes one token
3. **Tokens refill** after the time window expires
4. **Requests are blocked** when bucket is empty

```
Time Window: 15 minutes
Max Requests: 100

Request 1-100:  ✓ Allowed  (tokens: 100 → 0)
Request 101:    ✗ Blocked  (429 Too Many Requests)
After 15 min:   ✓ Allowed  (tokens reset to 100)
```

### Client Identification

Clients are identified by (in order of preference):

1. **User ID** - From JWT token (`user:abc123`)
2. **API Key Hash** - Hashed API key (`apikey:def456`)
3. **IP Address** - Client IP (`ip:192.168.1.1`)

This ensures:
- Authenticated users have per-user limits
- API keys have independent limits
- Unauthenticated requests are limited by IP

## Rate Limit Headers

Every response includes rate limit information:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 75
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

### Header Descriptions

| Header | Description | Example |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Total requests allowed per window | `100` |
| `X-RateLimit-Remaining` | Requests remaining in current window | `75` |
| `X-RateLimit-Reset` | When the limit resets (ISO 8601) | `2024-01-15T10:30:00.000Z` |
| `Retry-After` | Seconds until reset (only when blocked) | `450` |

## Rate Limit Exceeded

When rate limit is exceeded, the server returns:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
Retry-After: 450
Content-Type: application/json

{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 450 seconds.",
  "limit": 100,
  "retryAfter": 450
}
```

## Configuration Examples

### Strict Limits (Public API)

```bash
# 50 requests per 5 minutes
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=50
RATE_LIMIT_WINDOW_MS=300000
```

### Standard Limits (Internal Services)

```bash
# 100 requests per 15 minutes
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

### Generous Limits (Development)

```bash
# 500 requests per hour
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=500
RATE_LIMIT_WINDOW_MS=3600000
```

### High-Traffic Production

```bash
# 1000 requests per 10 minutes
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_WINDOW_MS=600000
```

## Client Implementation

### JavaScript/TypeScript

```typescript
import axios, { AxiosError } from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:9090',
  headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
});

// Add response interceptor for rate limiting
client.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      console.log(`Rate limited. Retry after ${retryAfter}s`);

      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return client.request(error.config!);
    }
    throw error;
  }
);

// Make request with automatic retry on rate limit
const response = await client.get('/health');
```

### Python

```python
import requests
import time
import os

def make_request_with_retry(url, max_retries=3):
    headers = {'Authorization': f'Bearer {os.getenv("API_KEY")}'}

    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)

        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', 60))
            print(f'Rate limited. Waiting {retry_after}s...')
            time.sleep(retry_after)
            continue

        return response

    raise Exception('Max retries exceeded')

# Make request
response = make_request_with_retry('http://localhost:9090/health')
print(response.json())
```

### Go

```go
package main

import (
    "fmt"
    "net/http"
    "strconv"
    "time"
)

func makeRequestWithRetry(url string, apiKey string, maxRetries int) (*http.Response, error) {
    client := &http.Client{}

    for attempt := 0; attempt < maxRetries; attempt++ {
        req, _ := http.NewRequest("GET", url, nil)
        req.Header.Set("Authorization", "Bearer " + apiKey)

        resp, err := client.Do(req)
        if err != nil {
            return nil, err
        }

        if resp.StatusCode == 429 {
            retryAfter := resp.Header.Get("Retry-After")
            seconds, _ := strconv.Atoi(retryAfter)
            fmt.Printf("Rate limited. Waiting %ds...\n", seconds)
            time.Sleep(time.Duration(seconds) * time.Second)
            continue
        }

        return resp, nil
    }

    return nil, fmt.Errorf("max retries exceeded")
}
```

## Monitoring

### Check Rate Limit Status

```bash
# View current rate limit status
curl -I -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9090/health | grep X-RateLimit

# Output:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 47
# X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

### Prometheus Metrics

Monitor rate limiting via Prometheus:

```promql
# Rate limit exceeded events
rate(alcs_errors_total{type="rate_limit_exceeded"}[5m])

# Rate limit exceeded per minute
sum(increase(alcs_errors_total{type="rate_limit_exceeded"}[1m]))
```

### Grafana Alert

Create alerts for excessive rate limiting:

```yaml
- alert: HighRateLimitHits
  expr: rate(alcs_errors_total{type="rate_limit_exceeded"}[5m]) > 1
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High rate of rate limit hits"
    description: "{{ $value }} rate limit hits per second"
```

## Best Practices

### 1. **Set Appropriate Limits**

Consider your use case:
- **Public API**: Strict limits (50-100 req/5min)
- **Internal services**: Moderate limits (100-200 req/15min)
- **Trusted clients**: Generous limits (500-1000 req/hour)

### 2. **Implement Retry Logic**

Always implement exponential backoff:

```typescript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

### 3. **Cache Responses**

Reduce requests by caching:

```typescript
const cache = new Map();

async function getCachedHealth() {
  if (cache.has('health') && Date.now() - cache.get('health').time < 60000) {
    return cache.get('health').data;
  }

  const response = await client.get('/health');
  cache.set('health', { data: response.data, time: Date.now() });
  return response.data;
}
```

### 4. **Monitor Your Usage**

Track rate limit headers to avoid hitting limits:

```typescript
client.interceptors.response.use(response => {
  const remaining = response.headers['x-ratelimit-remaining'];
  if (remaining < 10) {
    console.warn(`Low rate limit remaining: ${remaining}`);
  }
  return response;
});
```

### 5. **Use Connection Pooling**

Reuse connections to reduce overhead:

```typescript
const client = axios.create({
  baseURL: 'http://localhost:9090',
  httpAgent: new http.Agent({ keepAlive: true }),
  maxRedirects: 5,
});
```

## Distributed Rate Limiting (Redis)

For production deployments with multiple ALCS instances, use Redis:

### 1. Install Redis

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### 2. Update Configuration

```bash
# .env
ENABLE_RATE_LIMITING=true
REDIS_URL=redis://localhost:6379
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

### 3. Update Rate Limit Service

Replace the in-memory store with Redis client (future enhancement).

## Troubleshooting

### "Rate limit exceeded" but low traffic

**Problem:** Getting rate limited with low request volume

**Cause:** Multiple clients sharing same IP address

**Solution:**
1. Use authentication to get per-user rate limits
2. Increase `RATE_LIMIT_MAX_REQUESTS`
3. Configure reverse proxy to pass real client IPs:
   ```nginx
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Real-IP $remote_addr;
   ```

### Rate limit not working

**Problem:** Requests not being rate limited

**Cause:** Rate limiting is disabled

**Solution:**
1. Check `.env` file:
   ```bash
   ENABLE_RATE_LIMITING=true
   ```
2. Restart the server

### Different limits per endpoint

**Problem:** Need different limits for different endpoints

**Solution:** Currently, rate limits are global. For per-endpoint limits, modify the rate limit check to use endpoint-specific namespaces:

```typescript
// In mcp-server.ts
const namespace = url.replace('/', ''); // 'health', 'ready', 'metrics'
const rateLimitResult = rateLimitService.checkLimit(rateLimitIdentifier, namespace);
```

## Disabling Rate Limiting

**Development Only:**

```bash
ENABLE_RATE_LIMITING=false
```

**⚠️ Warning:** Never disable rate limiting in production environments!

## Additional Resources

- [OWASP Rate Limiting Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [Authentication Guide](./AUTHENTICATION.md) - Combine with rate limiting
- [Security Best Practices](./SECURITY.md) - ALCS security guide
