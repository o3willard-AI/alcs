# ALCS Authentication Guide

This guide covers authentication setup and usage for the ALCS MCP Server.

## Overview

ALCS supports two authentication methods:
1. **API Key Authentication** - Simple, static keys for service-to-service authentication
2. **JWT (JSON Web Token)** - Token-based authentication with expiration and permissions

## Configuration

Authentication is controlled via environment variables in your `.env` file:

```bash
# Enable/disable authentication
ENABLE_AUTHENTICATION=true

# API Key authentication
API_KEY=your_generated_api_key_here

# JWT authentication
JWT_SECRET=your_generated_jwt_secret_here
JWT_EXPIRES_IN=24h  # Token expiration time (default: 24h)

# Optional: Allowed origins for CORS
ALLOWED_ORIGINS=https://example.com,https://app.example.com
```

## Quick Start

### 1. Generate Authentication Credentials

**Generate an API Key:**
```bash
npm run auth:generate-api-key
```

**Generate a JWT Secret:**
```bash
npm run auth:generate-jwt-secret
```

**Generate a JWT Token for a User:**
```bash
# Basic token
npm run auth:generate-jwt-token admin

# Token with specific permissions
npm run auth:generate-jwt-token user1 read,write,execute
```

### 2. Add Credentials to `.env`

Copy the generated credentials to your `.env` file:

```bash
ENABLE_AUTHENTICATION=true
API_KEY=abc123def456...
JWT_SECRET=your-64-char-secret...
```

### 3. Restart the Server

```bash
npm run mcp
```

## Authentication Methods

### API Key Authentication

API keys provide simple, static authentication. Ideal for:
- Service-to-service communication
- Internal tools
- Prometheus monitoring
- CI/CD pipelines

**How to Authenticate:**

```bash
# Using Bearer scheme
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:9090/health

# Using ApiKey scheme
curl -H "Authorization: ApiKey YOUR_API_KEY" http://localhost:9090/health
```

**Permissions:**
- API keys have full permissions (`*` wildcard)
- Cannot be revoked without regenerating and redeploying

### JWT Token Authentication

JWT tokens provide:
- Time-limited access (default: 24 hours)
- User identification
- Fine-grained permissions
- Token revocation via expiration

**How to Authenticate:**

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:9090/health
```

**JWT Payload Structure:**

```json
{
  "sub": "user123",           // User ID (subject)
  "permissions": [            // Optional permissions array
    "read",
    "write",
    "execute"
  ],
  "iat": 1234567890,          // Issued at (timestamp)
  "exp": 1234654290           // Expires at (timestamp)
}
```

**Generating Tokens Programmatically:**

```typescript
import { authService } from './src/services/authService';

// Generate token for a user
const token = authService.generateToken('user123', ['read', 'write']);

// Verify token
const context = await authService.authenticate(`Bearer ${token}`);
if (context.authenticated) {
  console.log(`User: ${context.userId}`);
  console.log(`Permissions: ${context.permissions}`);
}
```

## Protected Endpoints

### HTTP Endpoints

| Endpoint | Auth Required | Purpose |
|----------|--------------|---------|
| `/metrics` | ❌ No | Prometheus metrics (public for scraping) |
| `/health` | ✅ Yes | Service health check |
| `/ready` | ✅ Yes | Readiness probe (database connectivity) |

### MCP Protocol

The MCP protocol over stdio does not require authentication, as it runs locally. Authentication is only enforced on HTTP endpoints.

## Permissions

### Wildcard Permission

The `*` permission grants full access to all operations:

```typescript
const token = authService.generateToken('admin', ['*']);
```

### Custom Permissions

Define custom permissions for your use case:

```typescript
const token = authService.generateToken('analyst', [
  'read',
  'analyze',
  'view_metrics'
]);
```

### Checking Permissions

```typescript
// In a protected route or handler
const hasAccess = authService.hasPermissions(authContext, ['read', 'write']);
if (!hasAccess) {
  throw new Error('Insufficient permissions');
}
```

## Security Best Practices

### 1. **Use Strong Secrets**

```bash
# Generate secure API key (32 bytes)
npm run auth:generate-api-key

# Generate secure JWT secret (64 bytes)
npm run auth:generate-jwt-secret
```

### 2. **Rotate Credentials Regularly**

- Rotate API keys every 90 days
- Rotate JWT secrets every 180 days
- Use short token expiration times (1-24 hours)

### 3. **Store Secrets Securely**

**Development:**
```bash
# Use .env file (excluded from git)
echo "API_KEY=..." >> .env
```

**Production:**
```bash
# Use environment variables
export API_KEY="..."

# Or use secrets management
# - HashiCorp Vault
# - AWS Secrets Manager
# - Azure Key Vault
# - Kubernetes Secrets
```

### 4. **Use HTTPS in Production**

Always use HTTPS/TLS for API communication in production:

```bash
# Nginx reverse proxy example
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:9090;
        proxy_set_header Authorization $http_authorization;
    }
}
```

### 5. **Implement Rate Limiting**

Combine authentication with rate limiting to prevent abuse:

```bash
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### 6. **Monitor Authentication Failures**

Check Prometheus metrics for auth failures:

```promql
# Failed authentication attempts
rate(alcs_errors_total{type="auth_invalid_credentials"}[5m])

# Unauthorized access attempts
rate(alcs_errors_total{type="auth_missing_header"}[5m])
```

## Disabling Authentication

**Development Only:**

```bash
ENABLE_AUTHENTICATION=false
```

**⚠️ Warning:** Never disable authentication in production environments!

## Troubleshooting

### "Unauthorized" Error

**Problem:** Receiving 401 Unauthorized responses

**Solutions:**
1. Verify `ENABLE_AUTHENTICATION=true` in `.env`
2. Check that API key or JWT secret is set
3. Verify Authorization header format:
   ```
   Authorization: Bearer YOUR_TOKEN_HERE
   ```
4. For JWT tokens, check expiration:
   ```bash
   # Decode JWT to check expiration
   echo "YOUR_TOKEN" | cut -d'.' -f2 | base64 -d | jq .exp
   ```

### "Token Expired" Error

**Problem:** JWT token has expired

**Solution:**
1. Generate a new token:
   ```bash
   npm run auth:generate-jwt-token your_user_id
   ```
2. Or increase token expiration time in `.env`:
   ```bash
   JWT_EXPIRES_IN=7d  # 7 days
   ```

### Authentication Bypassed

**Problem:** Requests succeed without authentication

**Cause:** Authentication is disabled

**Solution:**
1. Check `.env` file:
   ```bash
   ENABLE_AUTHENTICATION=true
   ```
2. Restart the server

## Testing Authentication

### cURL Examples

```bash
# Test with API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:9090/health

# Test with JWT token
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:9090/health

# Test without auth (should fail)
curl http://localhost:9090/health
# Expected: {"error":"Unauthorized","message":"Valid authentication required"}
```

### JavaScript/TypeScript Example

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:9090',
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`
  }
});

// Make authenticated request
const response = await client.get('/health');
console.log(response.data);
```

### Python Example

```python
import requests
import os

headers = {
    'Authorization': f'Bearer {os.getenv("API_KEY")}'
}

response = requests.get('http://localhost:9090/health', headers=headers)
print(response.json())
```

## Integration Examples

### Prometheus Scraping

Prometheus can scrape `/metrics` without authentication:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'alcs'
    static_configs:
      - targets: ['alcs:9090']
    metrics_path: '/metrics'
    scrape_interval: 10s
```

### Kubernetes Health Checks

Use API key for readiness/liveness probes:

```yaml
# deployment.yaml
livenessProbe:
  httpGet:
    path: /health
    port: 9090
    httpHeaders:
    - name: Authorization
      value: Bearer YOUR_API_KEY
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 9090
    httpHeaders:
    - name: Authorization
      value: Bearer YOUR_API_KEY
  initialDelaySeconds: 10
  periodSeconds: 5
```

## Additional Resources

- [JWT.io](https://jwt.io/) - JWT token decoder and debugger
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Security Best Practices](./SECURITY.md) - ALCS security guide

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/alcs/issues
- Documentation: https://github.com/yourusername/alcs/tree/main/docs
