# ALCS Security Hardening Guide

This guide provides comprehensive security recommendations for hardening ALCS in production environments.

## Table of Contents

- [Security Overview](#security-overview)
- [Authentication & Authorization](#authentication--authorization)
- [Network Security](#network-security)
- [Data Protection](#data-protection)
- [Application Security](#application-security)
- [Infrastructure Security](#infrastructure-security)
- [Monitoring & Auditing](#monitoring--auditing)
- [Compliance](#compliance)

## Security Overview

### Security Layers

ALCS implements defense-in-depth with multiple security layers:

```
┌─────────────────────────────────────────┐
│         External Firewall/WAF           │
├─────────────────────────────────────────┤
│         TLS/HTTPS Encryption            │
├─────────────────────────────────────────┤
│     Authentication (API Key/JWT)        │
├─────────────────────────────────────────┤
│     Rate Limiting & DDoS Protection     │
├─────────────────────────────────────────┤
│     Input Validation & Sanitization     │
├─────────────────────────────────────────┤
│         Network Policies                │
├─────────────────────────────────────────┤
│         RBAC & Permissions              │
├─────────────────────────────────────────┤
│       Database Encryption (TLS)         │
├─────────────────────────────────────────┤
│         Audit Logging                   │
└─────────────────────────────────────────┘
```

### Security Principles

1. **Least Privilege**: Grant minimum permissions required
2. **Defense in Depth**: Multiple layers of security
3. **Fail Securely**: Deny by default
4. **Security by Design**: Built-in, not bolted on
5. **Zero Trust**: Never trust, always verify

## Authentication & Authorization

### API Key Security

**Generation:**
```bash
# Use cryptographically secure random generator
npm run auth:generate-api-key

# Or with OpenSSL
openssl rand -base64 32

# NEVER use:
# - Sequential keys
# - Predictable patterns
# - Weak random generators
```

**Storage:**
```bash
# DO: Store hashed API keys
API_KEY_HASH=$(echo -n "$API_KEY" | sha256sum | cut -d' ' -f1)

# DON'T: Store plaintext API keys in:
# - Git repositories
# - Configuration files
# - Application logs
# - Error messages

# Use secrets management:
# - Kubernetes Secrets (encrypted at rest)
# - HashiCorp Vault
# - AWS Secrets Manager
# - GCP Secret Manager
# - Azure Key Vault
```

**Rotation:**
```bash
# Rotate API keys every 90 days
# 1. Generate new key
NEW_API_KEY=$(openssl rand -base64 32)

# 2. Update secret (keep old key temporarily)
kubectl create secret generic alcs-secrets-new \
  --from-literal=API_KEY=$NEW_API_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Deploy with new secret
kubectl set env deployment/alcs -n alcs \
  --from=secret/alcs-secrets-new

# 4. Notify clients (grace period: 7 days)
# 5. Remove old key after grace period
```

**API Key Validation:**
```typescript
// ✅ GOOD: Constant-time comparison
const isValid = crypto.timingSafeEqual(
  Buffer.from(providedHash),
  Buffer.from(storedHash)
);

// ❌ BAD: Timing attack vulnerable
if (providedKey === storedKey) { ... }
```

### JWT Security

**Configuration:**
```bash
# Strong secret (min 64 bytes)
JWT_SECRET=$(openssl rand -base64 64)

# Appropriate expiration
JWT_EXPIRES_IN=24h  # 24 hours for user tokens
JWT_EXPIRES_IN=1h   # 1 hour for service tokens

# Use HS256 or RS256 algorithm
JWT_ALGORITHM=HS256
```

**Token Generation:**
```typescript
// ✅ GOOD: Include all security claims
const token = jwt.sign(
  {
    sub: userId,           // Subject (user ID)
    iat: Date.now(),       // Issued at
    exp: expiresAt,        // Expiration
    jti: tokenId,          // Unique token ID (for revocation)
    aud: 'alcs-api',       // Audience
    iss: 'alcs-auth',      // Issuer
    permissions: ['read'], // User permissions
  },
  JWT_SECRET,
  { algorithm: 'HS256' }
);

// ❌ BAD: Missing security claims
const token = jwt.sign({ userId }, JWT_SECRET);
```

**Token Validation:**
```typescript
// ✅ GOOD: Validate all claims
jwt.verify(token, JWT_SECRET, {
  algorithms: ['HS256'],
  audience: 'alcs-api',
  issuer: 'alcs-auth',
  clockTolerance: 30,  // 30 seconds for clock skew
});

// Check revocation list
if (await isTokenRevoked(decoded.jti)) {
  throw new Error('Token revoked');
}

// ❌ BAD: No validation
const decoded = jwt.decode(token);  // Doesn't verify signature!
```

**Token Revocation:**
```typescript
// Implement token revocation for:
// - User logout
// - Password change
// - Security breach
// - Suspicious activity

// Option 1: Revocation list (Redis)
await redis.set(`revoked:${tokenId}`, '1', 'EX', 86400);

// Option 2: Short-lived tokens + refresh tokens
// Access token: 15 minutes
// Refresh token: 7 days (stored in database)
```

### Permission-Based Access Control

**Define Permissions:**
```typescript
enum Permission {
  // Session management
  SESSION_CREATE = 'session:create',
  SESSION_READ = 'session:read',
  SESSION_UPDATE = 'session:update',
  SESSION_DELETE = 'session:delete',

  // Analysis
  ANALYSIS_RUN = 'analysis:run',
  ANALYSIS_READ = 'analysis:read',

  // Admin
  ADMIN_ALL = 'admin:*',
}

// Role definitions
const roles = {
  user: [
    Permission.SESSION_CREATE,
    Permission.SESSION_READ,
    Permission.ANALYSIS_RUN,
  ],
  admin: [Permission.ADMIN_ALL],
};
```

**Check Permissions:**
```typescript
// ✅ GOOD: Check permissions on every request
function checkPermission(authContext: AuthContext, required: Permission): boolean {
  if (!authContext.authenticated) return false;

  if (authContext.permissions?.includes('admin:*')) return true;

  return authContext.permissions?.includes(required) ?? false;
}

// Use middleware
app.use('/api/sessions', requirePermission(Permission.SESSION_CREATE));

// ❌ BAD: Rely on client-side checks only
if (user.isAdmin) { /* show admin UI */ }  // Client can manipulate this
```

## Network Security

### TLS/HTTPS

**Minimum Configuration:**
```nginx
# NGINX configuration
server {
  listen 443 ssl http2;
  server_name alcs.example.com;

  # Certificate files
  ssl_certificate /etc/ssl/certs/alcs.crt;
  ssl_certificate_key /etc/ssl/private/alcs.key;

  # TLS version (disable old versions)
  ssl_protocols TLSv1.2 TLSv1.3;

  # Strong cipher suites
  ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
  ssl_prefer_server_ciphers off;

  # HSTS (force HTTPS for 1 year)
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  # Other security headers
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  # CSP (Content Security Policy)
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.anthropic.com;" always;
}

# Redirect HTTP to HTTPS
server {
  listen 80;
  server_name alcs.example.com;
  return 301 https://$server_name$request_uri;
}
```

**Certificate Management:**
```bash
# Use Let's Encrypt (free, automated)
certbot certonly --nginx -d alcs.example.com

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"

# Test certificate
openssl s_client -connect alcs.example.com:443 -tls1_3

# Check certificate expiration
echo | openssl s_client -connect alcs.example.com:443 2>/dev/null | \
  openssl x509 -noout -dates
```

### Kubernetes NetworkPolicies

**Strict Ingress Policy:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: alcs-strict
  namespace: alcs
spec:
  podSelector:
    matchLabels:
      app: alcs
  policyTypes:
  - Ingress
  - Egress

  ingress:
  # Only allow from ingress controller
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000

  # Only allow metrics from Prometheus
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
      podSelector:
        matchLabels:
          app: prometheus
    ports:
    - protocol: TCP
      port: 9090

  egress:
  # DNS resolution
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53

  # Database (same namespace only)
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432

  # Redis (same namespace only)
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379

  # HTTPS only (for LLM APIs)
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443

  # DENY all other traffic (implicit)
```

### Firewall Rules

**Cloud Provider Firewall:**
```bash
# AWS Security Groups
aws ec2 create-security-group \
  --group-name alcs-web \
  --description "ALCS web tier"

# Allow HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Allow SSH from bastion only
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 22 \
  --source-group sg-bastion

# Database security group (allow from app tier only)
aws ec2 authorize-security-group-ingress \
  --group-id sg-database \
  --protocol tcp \
  --port 5432 \
  --source-group sg-alcs-app
```

**OS-Level Firewall (ufw):**
```bash
# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow HTTPS
sudo ufw allow 443/tcp

# Allow SSH (from specific IP)
sudo ufw allow from 192.168.1.100 to any port 22

# Block direct application access
sudo ufw deny 3000/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

## Data Protection

### Encryption at Rest

**Database Encryption:**
```bash
# PostgreSQL (enable TLS)
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
ssl_prefer_server_ciphers = on

# Transparent Data Encryption (TDE)
# For RDS, enable encryption when creating instance
aws rds create-db-instance \
  --db-instance-identifier alcs-db \
  --storage-encrypted \
  --kms-key-id arn:aws:kms:region:account:key/xxx
```

**Kubernetes Secrets Encryption:**
```yaml
# Enable encryption at rest for secrets
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: <base64-encoded-32-byte-key>
    - identity: {}

# Configure API server
kube-apiserver --encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

**Sensitive Data Handling:**
```typescript
// ✅ GOOD: Encrypt sensitive fields before storage
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Use for:
// - API keys
// - Tokens
// - Personal information
// - Payment data
```

### Encryption in Transit

**Internal Service Communication:**
```yaml
# Use mTLS (mutual TLS) for pod-to-pod communication
# Option 1: Service Mesh (Istio, Linkerd)
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: alcs
spec:
  mtls:
    mode: STRICT

# Option 2: Manual certificate management
# Generate certificates for each service
# Configure services to use TLS
```

**Database Connections:**
```bash
# PostgreSQL connection with TLS
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Verify certificate
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=/path/to/ca.crt
```

### Data Sanitization

**Logging:**
```typescript
// ✅ GOOD: Sanitize logs
function sanitizeForLogging(data: any): any {
  const sensitiveKeys = [
    'password', 'token', 'apiKey', 'secret',
    'authorization', 'cookie', 'creditCard'
  ];

  if (typeof data === 'object') {
    const sanitized = { ...data };
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeForLogging(sanitized[key]);
      }
    }
    return sanitized;
  }
  return data;
}

logger.info('Request received', sanitizeForLogging(req.body));

// ❌ BAD: Log sensitive data
logger.info('Request received', { apiKey: req.headers.authorization });
```

**Error Messages:**
```typescript
// ✅ GOOD: Generic error messages to clients
try {
  await database.query(userInput);
} catch (error) {
  logger.error('Database query failed', { error, query: userInput });
  res.status(500).json({ error: 'Internal server error' });
}

// ❌ BAD: Expose internal details
catch (error) {
  res.status(500).json({ error: error.message, stack: error.stack });
}
```

## Application Security

### Input Validation

**Always Validate:**
```typescript
// ✅ GOOD: Validate all inputs
const schema = {
  sessionId: {
    type: 'string',
    required: true,
    pattern: /^[a-zA-Z0-9_-]+$/,
    minLength: 1,
    maxLength: 100,
  },
  query: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 10000,
    sanitize: true,
  },
};

const result = validationService.validate(req.body, schema);
if (!result.valid) {
  return res.status(400).json({ error: 'Invalid input', details: result.errors });
}

// Use sanitized values
const { sessionId, query } = result.sanitized;

// ❌ BAD: Trust user input
const sessionId = req.body.sessionId;
await database.query(`SELECT * FROM sessions WHERE id = '${sessionId}'`);
```

**SQL Injection Prevention:**
```typescript
// ✅ GOOD: Use parameterized queries
await database.query(
  'SELECT * FROM sessions WHERE id = $1 AND user_id = $2',
  [sessionId, userId]
);

// ✅ GOOD: Use ORM
await Session.findOne({ where: { id: sessionId, userId } });

// ❌ BAD: String concatenation
await database.query(`SELECT * FROM sessions WHERE id = '${sessionId}'`);
```

**Path Traversal Prevention:**
```typescript
// ✅ GOOD: Validate and normalize paths
import path from 'path';

function sanitizePath(userPath: string): string | null {
  // Resolve to absolute path
  const absolute = path.resolve('/app/data', userPath);

  // Ensure it's within allowed directory
  if (!absolute.startsWith('/app/data/')) {
    logger.warn('Path traversal attempt', { userPath, resolved: absolute });
    return null;
  }

  return absolute;
}

const safePath = sanitizePath(req.body.filePath);
if (!safePath) {
  return res.status(400).json({ error: 'Invalid path' });
}

// ❌ BAD: Use user input directly
const filePath = `/app/data/${req.body.filePath}`;
fs.readFile(filePath);  // Can read ../../etc/passwd
```

**XSS Prevention:**
```typescript
// ✅ GOOD: Escape output
import { escape } from 'html-escaper';

const userInput = req.body.comment;
const safeOutput = escape(userInput);

// ✅ GOOD: Use Content Security Policy
res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'");

// ✅ GOOD: Sanitize HTML
import DOMPurify from 'isomorphic-dompurify';
const clean = DOMPurify.sanitize(userInput);

// ❌ BAD: Render user input directly
res.send(`<div>${userInput}</div>`);
```

### Dependency Security

**Regular Updates:**
```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Force fix (may break)
npm audit fix --force

# Check specific package
npm view express versions
```

**Dependency Scanning:**
```bash
# Use Snyk
npm install -g snyk
snyk test
snyk monitor

# Use GitHub Dependabot
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

**Lock Files:**
```bash
# Always commit package-lock.json
git add package-lock.json

# Use exact versions for production
npm ci  # Install from lock file (CI/production)

# Don't use:
npm install  # Updates lock file (dev only)
```

### Rate Limiting

**Comprehensive Rate Limiting:**
```typescript
// Different limits for different endpoints
const rateLimits = {
  '/health': { max: 1000, window: 60000 },      // Health checks
  '/api/sessions': { max: 100, window: 60000 }, // API calls
  '/api/analysis': { max: 10, window: 60000 },  // Expensive operations
  '/auth/login': { max: 5, window: 60000 },     // Login attempts
};

// Apply rate limiting
app.use((req, res, next) => {
  const endpoint = req.path;
  const limits = rateLimits[endpoint] || { max: 100, window: 60000 };

  const identifier = extractRateLimitIdentifier(req);
  const result = rateLimitService.checkLimit(identifier, endpoint);

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: result.retryAfter,
    });
  }

  next();
});
```

**DDoS Protection:**
```nginx
# NGINX rate limiting
http {
  # Define rate limit zones
  limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
  limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;
  limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

  server {
    location / {
      limit_req zone=general burst=20 nodelay;
    }

    location /api/ {
      limit_req zone=api burst=10 nodelay;
    }

    location /auth/login {
      limit_req zone=login burst=3 nodelay;
    }
  }
}
```

## Infrastructure Security

### Container Security

**Base Image:**
```dockerfile
# ✅ GOOD: Use minimal, official images
FROM node:20-alpine

# ❌ BAD: Use bloated or unknown images
FROM node:latest
FROM some-random-user/node
```

**Non-Root User:**
```dockerfile
# ✅ GOOD: Run as non-root
FROM node:20-alpine

# Create app user
RUN addgroup -g 1000 app && \
    adduser -D -u 1000 -G app app

# Set ownership
WORKDIR /app
COPY --chown=app:app . .

# Switch to app user
USER app

CMD ["node", "dist/index.js"]

# ❌ BAD: Run as root
USER root
CMD ["node", "dist/index.js"]
```

**Read-Only Filesystem:**
```yaml
# Kubernetes pod security
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  readOnlyRootFilesystem: true
  capabilities:
    drop:
    - ALL
  allowPrivilegeEscalation: false

# Mount writable volumes only where needed
volumeMounts:
- name: tmp
  mountPath: /tmp
- name: cache
  mountPath: /app/cache
```

**Vulnerability Scanning:**
```bash
# Scan images with Trivy
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image your-registry/alcs:1.0.0

# Scan in CI/CD
# .github/workflows/security.yml
- name: Run Trivy scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: your-registry/alcs:${{ github.sha }}
    format: 'sarif'
    output: 'trivy-results.sarif'
```

### Kubernetes Security

**Pod Security Standards:**
```yaml
# Enforce restricted pod security
apiVersion: v1
kind: Namespace
metadata:
  name: alcs
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

**RBAC (Least Privilege):**
```yaml
# Minimal permissions
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: alcs-role
  namespace: alcs
rules:
# Read-only access to ConfigMaps
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]

# Read-only access to Secrets
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]

# No other permissions
```

**Network Isolation:**
```yaml
# Default deny all traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: alcs
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress

  # No rules = deny all
```

### Secrets Management

**External Secrets Operator:**
```yaml
# Sync secrets from external provider
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: alcs-secrets
  namespace: alcs
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: alcs-secrets
    creationPolicy: Owner
  data:
  - secretKey: API_KEY
    remoteRef:
      key: alcs/production/api-key
  - secretKey: JWT_SECRET
    remoteRef:
      key: alcs/production/jwt-secret
  - secretKey: DATABASE_URL
    remoteRef:
      key: alcs/production/database-url
```

**Sealed Secrets:**
```bash
# Encrypt secrets for Git
kubeseal --format=yaml < secret.yaml > sealed-secret.yaml

# Commit sealed secret safely
git add sealed-secret.yaml
git commit -m "Add sealed secret"

# SealedSecret controller decrypts in-cluster
kubectl apply -f sealed-secret.yaml
```

## Monitoring & Auditing

### Audit Logging

**Enable Kubernetes Audit Logging:**
```yaml
# /etc/kubernetes/audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
# Log secrets access
- level: RequestResponse
  resources:
  - group: ""
    resources: ["secrets"]

# Log authentication events
- level: Metadata
  verbs: ["create", "update", "patch", "delete"]
  resources:
  - group: "authentication.k8s.io"

# Don't log read-only requests
- level: None
  verbs: ["get", "list", "watch"]
```

**Application Audit Logging:**
```typescript
// Log security-relevant events
auditLogger.log({
  timestamp: new Date().toISOString(),
  event: 'authentication_success',
  userId: authContext.userId,
  method: authContext.method,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  correlationId: req.correlationId,
});

// Log failed authentication
auditLogger.log({
  timestamp: new Date().toISOString(),
  event: 'authentication_failure',
  reason: 'invalid_api_key',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

// Log sensitive operations
auditLogger.log({
  timestamp: new Date().toISOString(),
  event: 'session_deleted',
  userId: authContext.userId,
  sessionId: req.params.sessionId,
  ip: req.ip,
});
```

### Security Monitoring

**Metrics to Monitor:**
```prometheus
# Failed authentication attempts
rate(alcs_authentication_failures_total[5m]) > 10

# Rate limit violations
rate(alcs_rate_limit_exceeded_total[5m]) > 100

# Input validation failures
rate(alcs_validation_failed_total[5m]) > 50

# SQL injection attempts
alcs_sql_injection_attempts_total > 0

# Path traversal attempts
alcs_path_traversal_attempts_total > 0
```

**Alerts:**
```yaml
- alert: HighAuthenticationFailureRate
  expr: rate(alcs_authentication_failures_total[5m]) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High authentication failure rate"
    description: "{{ $value }} failed auth attempts per second"

- alert: SQLInjectionAttempt
  expr: increase(alcs_sql_injection_attempts_total[5m]) > 0
  labels:
    severity: critical
  annotations:
    summary: "SQL injection attempt detected"
    description: "SQL injection attempt from {{ $labels.ip }}"
```

## Compliance

### Data Privacy (GDPR, CCPA)

**Data Minimization:**
```typescript
// Only collect necessary data
interface UserData {
  userId: string;           // ✅ Necessary for identification
  email?: string;           // ✅ If email notifications needed
  name?: string;            // ❓ Only if required
  // ❌ Don't collect unnecessary PII
  // birthdate?: string;
  // address?: string;
}
```

**Right to Deletion:**
```typescript
// Implement data deletion
async function deleteUserData(userId: string): Promise<void> {
  await database.transaction(async (trx) => {
    // Delete user sessions
    await trx('sessions').where({ user_id: userId }).del();

    // Anonymize logs (keep for security, but remove PII)
    await trx('audit_logs')
      .where({ user_id: userId })
      .update({ user_id: 'deleted_user', ip: '0.0.0.0' });

    // Delete user account
    await trx('users').where({ id: userId }).del();
  });

  logger.info('User data deleted', { userId });
}
```

**Data Export:**
```typescript
// Implement data export (GDPR right to data portability)
async function exportUserData(userId: string): Promise<any> {
  const [user, sessions, logs] = await Promise.all([
    database('users').where({ id: userId }).first(),
    database('sessions').where({ user_id: userId }),
    database('audit_logs').where({ user_id: userId }),
  ]);

  return {
    user,
    sessions,
    logs,
    exportedAt: new Date().toISOString(),
  };
}
```

### Security Standards

**OWASP Top 10 Compliance:**
- ✅ A01: Broken Access Control → RBAC + permissions
- ✅ A02: Cryptographic Failures → TLS + encryption at rest
- ✅ A03: Injection → Input validation + parameterized queries
- ✅ A04: Insecure Design → Defense in depth + secure defaults
- ✅ A05: Security Misconfiguration → Hardened configs + scanning
- ✅ A06: Vulnerable Components → Dependency scanning + updates
- ✅ A07: Authentication Failures → Strong auth + rate limiting
- ✅ A08: Data Integrity Failures → Integrity checks + signing
- ✅ A09: Logging Failures → Comprehensive audit logging
- ✅ A10: SSRF → Input validation + network policies

**CIS Benchmarks:**
- Run CIS compliance checks
- Harden OS configuration
- Secure container runtime
- Kubernetes hardening

## Security Checklist

### Pre-Deployment
- [ ] Strong secrets generated (API keys, JWT secret)
- [ ] TLS/HTTPS configured with valid certificate
- [ ] Firewall rules configured (allow HTTPS only)
- [ ] NetworkPolicies applied (Kubernetes)
- [ ] Secrets encrypted at rest
- [ ] RBAC configured with least privilege
- [ ] Non-root container user configured
- [ ] Read-only root filesystem enabled
- [ ] Resource limits set
- [ ] Audit logging enabled

### Post-Deployment
- [ ] Security scanning completed (no critical vulnerabilities)
- [ ] Penetration testing completed
- [ ] Authentication tested
- [ ] Rate limiting verified
- [ ] Input validation tested
- [ ] Audit logs reviewed
- [ ] Monitoring alerts configured
- [ ] Incident response plan documented
- [ ] Security training completed
- [ ] Compliance requirements met

### Ongoing
- [ ] Dependency updates (monthly)
- [ ] Secret rotation (quarterly)
- [ ] Certificate renewal (automated)
- [ ] Security audit logs reviewed (weekly)
- [ ] Vulnerability scanning (weekly)
- [ ] Penetration testing (annually)
- [ ] Compliance audits (as required)
- [ ] Security training (annually)

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
