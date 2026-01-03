# ALCS Production Deployment Guide

This guide covers deploying ALCS to production environments with all Phase 5 features enabled.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
- [Configuration](#configuration)
- [Security Setup](#security-setup)
- [Monitoring Setup](#monitoring-setup)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedures](#rollback-procedures)

## Overview

ALCS production deployment includes:
- **Authentication**: API key and JWT-based authentication
- **Rate Limiting**: Token bucket algorithm with configurable limits
- **Input Validation**: Schema-based validation with security scanning
- **Response Caching**: In-memory caching with TTL support
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Logging**: Structured JSON logging with correlation IDs
- **Health Checks**: Liveness, readiness, and startup probes
- **High Availability**: Multi-replica deployment with autoscaling

## Prerequisites

### Required

- **Compute**: Kubernetes cluster (v1.24+) OR Docker Compose environment
- **Database**: PostgreSQL 15+ with persistent storage
- **Cache**: Redis 7+ (recommended for multi-instance deployments)
- **TLS**: Valid SSL/TLS certificate for HTTPS
- **Secrets**: Secure storage for API keys and credentials

### Optional but Recommended

- **Monitoring**: Prometheus and Grafana stack
- **Logging**: ELK stack or Loki for log aggregation
- **Secrets Management**: Vault, AWS Secrets Manager, or GCP Secret Manager
- **Load Balancer**: NGINX or cloud provider load balancer
- **CI/CD**: GitHub Actions, GitLab CI, or Jenkins
- **Backup**: Automated database backup solution

## Deployment Options

### Option 1: Kubernetes (Recommended for Production)

Best for:
- High availability requirements
- Autoscaling needs
- Cloud-native deployments
- Multi-environment setups

**Pros:**
- Automated scaling (HPA)
- Self-healing and rolling updates
- Advanced networking (NetworkPolicies)
- Native monitoring integration
- Production-grade orchestration

**Cons:**
- Higher complexity
- Requires Kubernetes expertise
- Additional infrastructure costs

**Guide:** See [k8s/README.md](../k8s/README.md)

### Option 2: Docker Compose

Best for:
- Single-server deployments
- Development/staging environments
- Quick prototyping
- Small-scale production

**Pros:**
- Simpler setup
- Lower resource requirements
- Easier debugging
- Good for single-node deployments

**Cons:**
- Manual scaling
- No built-in high availability
- Limited orchestration features

**Guide:** See [docker/README.md](../docker/README.md)

### Option 3: Docker Swarm

Best for:
- Multi-node deployments without Kubernetes
- Teams familiar with Docker
- Moderate scale requirements

**Pros:**
- Easier than Kubernetes
- Built-in orchestration
- Native Docker integration

**Cons:**
- Less mature than Kubernetes
- Smaller ecosystem
- Limited advanced features

### Option 4: Bare Metal / VMs

Best for:
- Maximum control
- Special compliance requirements
- Custom infrastructure

**Pros:**
- Full control over environment
- No container overhead
- Direct hardware access

**Cons:**
- Manual everything
- No built-in orchestration
- More maintenance overhead

## Configuration

### Step 1: Environment Variables

Create a production `.env` file:

```bash
# Copy the example
cp .env.example .env.production

# Edit with production values
nano .env.production
```

**Critical Variables:**

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (use connection pooling)
DATABASE_URL=postgresql://user:password@postgres:5432/alcs?pool_min=5&pool_max=20
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=alcs
POSTGRES_USER=alcs
POSTGRES_PASSWORD=<STRONG_PASSWORD>

# Redis (required for multi-instance)
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379

# Authentication
ENABLE_AUTHENTICATION=true
API_KEY=<GENERATED_API_KEY>
JWT_SECRET=<GENERATED_JWT_SECRET>
JWT_EXPIRES_IN=24h

# LLM APIs
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
MODEL_NAME=claude-3-5-sonnet-20241022

# Rate Limiting
ENABLE_RATE_LIMITING=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# Caching
CACHE_DEFAULT_TTL=300
CACHE_MAX_ITEMS=1000

# Session Management
MAX_SESSIONS=1000
SESSION_TIMEOUT=3600000
CLEANUP_INTERVAL=300000

# Performance
MAX_CONCURRENT_REQUESTS=50
REQUEST_TIMEOUT=30000
STREAMING_ENABLED=true

# Quality Control
QUALITY_THRESHOLD=0.7
MAX_ITERATIONS=5
MIN_CONFIDENCE=0.6
```

### Step 2: Generate Secrets

**Generate API Key:**
```bash
npm run auth:generate-api-key
```

**Generate JWT Secret:**
```bash
npm run auth:generate-jwt-secret
```

**Alternative (OpenSSL):**
```bash
# API Key (32 bytes)
openssl rand -base64 32

# JWT Secret (64 bytes)
openssl rand -base64 64
```

### Step 3: Database Setup

**Create Database:**
```sql
-- Connect as superuser
CREATE DATABASE alcs;
CREATE USER alcs WITH ENCRYPTED PASSWORD 'strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE alcs TO alcs;

-- Connect to alcs database
\c alcs
GRANT ALL ON SCHEMA public TO alcs;
```

**Run Migrations:**
```bash
# Using npm
npm run migrate

# Using Docker
docker exec -it alcs-app npm run migrate
```

**Verify Schema:**
```sql
\c alcs
\dt  -- List tables
SELECT COUNT(*) FROM sessions;  -- Test query
```

### Step 4: TLS/SSL Certificates

**Option A: Let's Encrypt (Recommended)**
```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificate
sudo certbot certonly --standalone \
  -d alcs.example.com \
  --email admin@example.com \
  --agree-tos

# Certificates will be in:
# /etc/letsencrypt/live/alcs.example.com/fullchain.pem
# /etc/letsencrypt/live/alcs.example.com/privkey.pem

# Auto-renewal crontab
0 0 * * * certbot renew --quiet
```

**Option B: Custom Certificate**
```bash
# Generate self-signed (dev/test only)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/alcs.key \
  -out /etc/ssl/certs/alcs.crt \
  -subj "/CN=alcs.example.com"
```

**Option C: Cloud Provider**
- AWS: Use AWS Certificate Manager (ACM)
- GCP: Use Google-managed SSL certificates
- Azure: Use Azure Key Vault certificates

## Security Setup

### 1. Authentication Configuration

**API Key Setup:**
```bash
# Generate strong API key
API_KEY=$(openssl rand -base64 32)

# Add to secrets
kubectl create secret generic alcs-secrets \
  --from-literal=API_KEY=$API_KEY \
  -n alcs

# Or for Docker Compose, add to .env
echo "API_KEY=$API_KEY" >> .env.production
```

**JWT Configuration:**
```bash
# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 64)

# Configure expiration
JWT_EXPIRES_IN=24h  # 24 hours
# Other options: 1h, 7d, 30d

# Add to secrets
kubectl create secret generic alcs-secrets \
  --from-literal=JWT_SECRET=$JWT_SECRET \
  -n alcs
```

**Generate Test Token:**
```bash
# Generate token for testing
npm run auth:generate-jwt-token admin

# Test authentication
curl -H "Authorization: Bearer <token>" \
  https://alcs.example.com/health
```

### 2. Network Security

**Firewall Rules:**
```bash
# Allow HTTPS only
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp  # Block direct app access

# Allow SSH (admin access)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

**Kubernetes NetworkPolicies:**
```bash
# Already included in k8s/networkpolicy.yaml
kubectl apply -f k8s/networkpolicy.yaml
```

### 3. Database Security

**Connection Security:**
```bash
# Enable SSL in PostgreSQL (postgresql.conf)
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'

# Require SSL (pg_hba.conf)
hostssl all all 0.0.0.0/0 scram-sha-256
```

**Access Control:**
```sql
-- Revoke public access
REVOKE ALL ON DATABASE alcs FROM PUBLIC;

-- Grant only to alcs user
GRANT CONNECT ON DATABASE alcs TO alcs;
GRANT USAGE ON SCHEMA public TO alcs;
GRANT ALL ON ALL TABLES IN SCHEMA public TO alcs;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO alcs;
```

### 4. Secrets Management

**Kubernetes Secrets:**
```bash
# Create sealed secrets (encrypted at rest)
kubectl create secret generic alcs-secrets \
  --from-env-file=.env.production \
  --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml

kubectl apply -f sealed-secret.yaml
```

**External Secrets Operator:**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: alcs-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: alcs-secrets
  data:
  - secretKey: API_KEY
    remoteRef:
      key: alcs/production
      property: API_KEY
```

### 5. RBAC Configuration

**Kubernetes RBAC:**
```bash
# Already configured in k8s/rbac.yaml
# Minimal permissions:
# - Read ConfigMaps
# - Read Secrets
# - No cluster-level access
kubectl apply -f k8s/rbac.yaml
```

## Monitoring Setup

### 1. Prometheus

**Install Prometheus Operator:**
```bash
# Using Helm
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

**Deploy ServiceMonitor:**
```bash
# Already included in k8s/servicemonitor.yaml
kubectl apply -f k8s/servicemonitor.yaml
```

**Verify Metrics:**
```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring \
  svc/prometheus-kube-prometheus-prometheus 9090:9090

# Open http://localhost:9090
# Query: alcs_sessions_active
```

### 2. Grafana Dashboards

**Import Dashboards:**
```bash
# Access Grafana
kubectl port-forward -n monitoring \
  svc/prometheus-grafana 3000:80

# Login (default: admin/prom-operator)
# Navigate to Dashboards > Import
# Upload: monitoring/grafana-dashboard.json
```

**Dashboard Included:**
- ALCS Overview: General health and performance
- Session Metrics: Active sessions, creation rate
- API Performance: Request duration, error rate
- Resource Usage: CPU, memory, cache hit rate
- LLM Metrics: Token usage, model calls, costs

### 3. Alerting Rules

**Prometheus AlertManager:**
```yaml
# k8s/prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: alcs-alerts
  namespace: alcs
spec:
  groups:
  - name: alcs
    interval: 30s
    rules:
    - alert: ALCSHighErrorRate
      expr: rate(alcs_errors_total[5m]) > 0.05
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High error rate detected"
        description: "Error rate is {{ $value }} errors/sec"

    - alert: ALCSHighMemoryUsage
      expr: |
        container_memory_usage_bytes{pod=~"alcs-.*"} /
        container_spec_memory_limit_bytes{pod=~"alcs-.*"} > 0.9
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage"
        description: "Memory usage is {{ $value | humanizePercentage }}"

    - alert: ALCSPodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total{pod=~"alcs-.*"}[15m]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Pod is crash looping"
        description: "Pod {{ $labels.pod }} is restarting"
```

**Apply Rules:**
```bash
kubectl apply -f k8s/prometheus-rules.yaml
```

### 4. Log Aggregation

**Option A: Loki (Lightweight)**
```bash
# Install Loki
helm install loki grafana/loki-stack \
  --namespace monitoring

# Configure Promtail to collect logs
# Logs automatically appear in Grafana
```

**Option B: ELK Stack**
```bash
# Install Elasticsearch, Logstash, Kibana
# Configure Filebeat to ship logs
# Create index pattern in Kibana
```

**Log Format:**
ALCS uses structured JSON logging:
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Session created",
  "correlationId": "req_abc123",
  "sessionId": "sess_xyz789",
  "userId": "user123",
  "duration": 1234
}
```

## Post-Deployment Verification

### 1. Health Checks

**Basic Health:**
```bash
# Check health endpoint
curl https://alcs.example.com/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

**Readiness Check:**
```bash
curl https://alcs.example.com/ready

# Expected response:
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "llm": "ok"
  }
}
```

### 2. Authentication Test

**API Key:**
```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://alcs.example.com/health
```

**JWT Token:**
```bash
# Generate token
TOKEN=$(npm run auth:generate-jwt-token admin | grep "JWT Token:" -A1 | tail -1)

# Test
curl -H "Authorization: Bearer $TOKEN" \
  https://alcs.example.com/health
```

### 3. Metrics Verification

**Check Metrics Endpoint:**
```bash
curl https://alcs.example.com/metrics

# Should see Prometheus metrics:
# alcs_sessions_active 5
# alcs_requests_total{status="200"} 1234
# alcs_request_duration_seconds_bucket{le="0.1"} 567
```

### 4. Database Connection

**Test Database:**
```bash
# Kubernetes
kubectl exec -it -n alcs deployment/alcs -- \
  node -e "require('./dist/services/database').testConnection()"

# Docker Compose
docker exec -it alcs-app \
  node -e "require('./dist/services/database').testConnection()"
```

### 5. Rate Limiting Test

**Test Rate Limits:**
```bash
# Send 101 requests (limit is 100)
for i in {1..101}; do
  curl -H "Authorization: Bearer $API_KEY" \
    https://alcs.example.com/health
done

# Request 101 should return 429:
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 60 seconds.",
  "retryAfter": 60
}
```

### 6. Caching Test

**Check Cache Headers:**
```bash
curl -I https://alcs.example.com/health

# Headers should include:
# X-Cache: HIT
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
```

### 7. Kubernetes-Specific Checks

**Pod Status:**
```bash
kubectl get pods -n alcs

# All pods should be Running
NAME                    READY   STATUS    RESTARTS   AGE
alcs-7b8f9d5c4-abc12    1/1     Running   0          5m
alcs-7b8f9d5c4-def34    1/1     Running   0          5m
alcs-7b8f9d5c4-ghi56    1/1     Running   0          5m
postgres-0              1/1     Running   0          5m
redis-6b8c9f4d-xyz78    1/1     Running   0          5m
```

**Service Status:**
```bash
kubectl get svc -n alcs

# Services should have ClusterIP
NAME       TYPE        CLUSTER-IP      PORT(S)
alcs       ClusterIP   10.96.123.45    3000/TCP,9090/TCP
postgres   ClusterIP   10.96.123.46    5432/TCP
redis      ClusterIP   10.96.123.47    6379/TCP
```

**Ingress Status:**
```bash
kubectl get ingress -n alcs

# Ingress should have ADDRESS
NAME   CLASS   HOSTS              ADDRESS          PORTS
alcs   nginx   alcs.example.com   34.123.45.67     80,443
```

**HPA Status:**
```bash
kubectl get hpa -n alcs

# HPA should show current metrics
NAME   REFERENCE        TARGETS         MINPODS   MAXPODS   REPLICAS
alcs   Deployment/alcs  45%/70%, 60%/80%   3      10        3
```

### 8. Load Testing

**Simple Load Test:**
```bash
# Install hey (HTTP load generator)
go install github.com/rakyll/hey@latest

# Run load test (100 requests, 10 concurrent)
hey -n 100 -c 10 \
  -H "Authorization: Bearer $API_KEY" \
  https://alcs.example.com/health

# Monitor with:
kubectl top pods -n alcs
watch kubectl get hpa -n alcs
```

**Advanced Load Test (k6):**
```javascript
// load-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '5m', target: 50 },   // Stay at 50
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100
    { duration: '2m', target: 0 },    // Ramp down
  ],
};

export default function() {
  const response = http.get('https://alcs.example.com/health', {
    headers: { 'Authorization': `Bearer ${__ENV.API_KEY}` },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

```bash
# Run k6 test
k6 run --env API_KEY=$API_KEY load-test.js
```

## Rollback Procedures

### Kubernetes Rollback

**View Deployment History:**
```bash
kubectl rollout history deployment/alcs -n alcs
```

**Rollback to Previous Version:**
```bash
# Rollback to previous revision
kubectl rollout undo deployment/alcs -n alcs

# Rollback to specific revision
kubectl rollout undo deployment/alcs -n alcs --to-revision=2
```

**Monitor Rollback:**
```bash
kubectl rollout status deployment/alcs -n alcs
```

### Docker Compose Rollback

**Stop Current Version:**
```bash
docker-compose down
```

**Switch to Previous Version:**
```bash
# Edit docker-compose.yml
# Change image tag to previous version
image: your-registry/alcs:1.0.0  # <- previous version

# Start previous version
docker-compose up -d
```

**Verify:**
```bash
docker-compose ps
curl http://localhost:3000/health
```

### Database Rollback

**Restore from Backup:**
```bash
# Stop application
kubectl scale deployment alcs -n alcs --replicas=0

# Restore database
kubectl exec -i -n alcs postgres-0 -- \
  psql -U alcs alcs < backup-2024-01-15.sql

# Restart application
kubectl scale deployment alcs -n alcs --replicas=3
```

### Configuration Rollback

**Kubernetes ConfigMap/Secret:**
```bash
# Restore previous ConfigMap
kubectl apply -f k8s/configmap.yaml.backup

# Restart pods
kubectl rollout restart deployment/alcs -n alcs
```

**Docker Compose .env:**
```bash
# Restore previous .env
cp .env.production.backup .env.production

# Restart services
docker-compose restart
```

## Troubleshooting

See [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) for detailed troubleshooting procedures.

## Next Steps

1. **Set up monitoring alerts**: Configure AlertManager for critical issues
2. **Configure backups**: Set up automated database backups
3. **Implement log rotation**: Configure log retention policies
4. **Review security**: Run security audit and penetration testing
5. **Document procedures**: Create incident response playbooks
6. **Train team**: Ensure ops team knows deployment and rollback procedures

## Additional Resources

- [Operations Runbook](OPERATIONS-RUNBOOK.md)
- [Security Hardening Guide](SECURITY-HARDENING.md)
- [Monitoring & Alerting Guide](MONITORING-ALERTING.md)
- [Kubernetes README](../k8s/README.md)
- [Docker README](../docker/README.md)
- [Authentication Guide](AUTHENTICATION.md)
- [Rate Limiting Guide](RATE-LIMITING.md)
