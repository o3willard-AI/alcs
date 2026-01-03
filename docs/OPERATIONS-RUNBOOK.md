# ALCS Operations Runbook

This runbook provides step-by-step procedures for common operational tasks and incident response.

## Table of Contents

- [Daily Operations](#daily-operations)
- [Incident Response](#incident-response)
- [Common Issues](#common-issues)
- [Maintenance Procedures](#maintenance-procedures)
- [Emergency Procedures](#emergency-procedures)
- [Monitoring and Alerting](#monitoring-and-alerting)

## Daily Operations

### Health Check Routine

**Frequency:** Daily (automated + manual verification)

**Automated Health Checks:**
```bash
# Check overall system health
curl https://alcs.example.com/health

# Check specific pod health (Kubernetes)
kubectl get pods -n alcs
kubectl top pods -n alcs

# Check service status (Docker Compose)
docker-compose ps
docker stats --no-stream
```

**Manual Verification:**
1. Check Grafana dashboards for anomalies
2. Review error logs for recurring issues
3. Verify backup completion
4. Check certificate expiration dates
5. Review rate limiting effectiveness

### Log Review

**Check Recent Errors:**
```bash
# Kubernetes
kubectl logs -n alcs -l app=alcs --tail=100 | grep -i error

# Docker Compose
docker-compose logs --tail=100 | grep -i error

# Specific pod
kubectl logs -n alcs <pod-name> --since=1h | grep -E "error|critical"
```

**Review Access Patterns:**
```bash
# Check for suspicious activity
kubectl logs -n alcs -l app=alcs --tail=1000 | \
  grep "401\|403\|429" | \
  awk '{print $1, $2, $10}' | sort | uniq -c | sort -rn

# High rate limit violations
kubectl logs -n alcs -l app=alcs | \
  grep "Rate limit exceeded" | wc -l
```

### Metrics Review

**Check Key Metrics:**
```bash
# Active sessions
curl -s https://alcs.example.com/metrics | grep alcs_sessions_active

# Error rate (last 5 minutes)
curl -s https://alcs.example.com/metrics | grep alcs_errors_total

# Request duration (p95)
curl -s https://alcs.example.com/metrics | \
  grep alcs_request_duration_seconds | grep quantile=\"0.95\"

# Cache hit rate
curl -s https://alcs.example.com/metrics | grep alcs_cache
```

**Grafana Dashboards:**
1. Open ALCS Overview dashboard
2. Check for red alerts
3. Review 24-hour trends
4. Compare to baseline metrics

### Backup Verification

**Verify Latest Backup:**
```bash
# Check backup timestamp
ls -lh /backups/alcs/ | tail -5

# Verify backup integrity
pg_restore --list /backups/alcs/latest.backup | head -20

# Check backup size (should be consistent)
du -h /backups/alcs/ | tail -1
```

**Test Restore (Weekly):**
```bash
# Create test database
createdb alcs_restore_test

# Restore backup
pg_restore -d alcs_restore_test /backups/alcs/latest.backup

# Verify data
psql alcs_restore_test -c "SELECT COUNT(*) FROM sessions;"

# Cleanup
dropdb alcs_restore_test
```

## Incident Response

### Severity Levels

**Critical (P0):**
- Complete service outage
- Data loss or corruption
- Security breach
- Response time: Immediate

**High (P1):**
- Degraded performance affecting >50% users
- Failed deployments
- Database issues
- Response time: < 1 hour

**Medium (P2):**
- Minor performance degradation
- Non-critical feature failures
- Elevated error rates
- Response time: < 4 hours

**Low (P3):**
- Cosmetic issues
- Documentation errors
- Non-urgent improvements
- Response time: Next business day

### Incident Response Process

**Step 1: Detect and Alert**
```bash
# Check current status
kubectl get pods -n alcs
kubectl get events -n alcs --sort-by='.lastTimestamp' | tail -20

# Check recent deployments
kubectl rollout history deployment/alcs -n alcs

# Check resource usage
kubectl top pods -n alcs
kubectl top nodes
```

**Step 2: Assess Impact**
```bash
# Check error rate
curl -s https://alcs.example.com/metrics | grep alcs_errors_total

# Check active users
curl -s https://alcs.example.com/metrics | grep alcs_sessions_active

# Check response times
curl -s https://alcs.example.com/metrics | grep alcs_request_duration

# Determine severity level based on:
# - Number of affected users
# - Duration of issue
# - Data integrity risk
# - Security implications
```

**Step 3: Communicate**
```bash
# Send initial notification
# Subject: [INCIDENT] ALCS - <Brief Description> - <Severity>
# Body:
#   - What: Brief description of the issue
#   - When: Start time
#   - Impact: User/system impact
#   - Status: Investigating/Identified/Fixing
#   - ETA: Expected resolution time
```

**Step 4: Mitigate**

See specific incident procedures below.

**Step 5: Resolve**
```bash
# Verify resolution
curl https://alcs.example.com/health
kubectl get pods -n alcs

# Monitor for 15 minutes
watch -n 30 'kubectl get pods -n alcs'

# Check metrics returned to normal
curl -s https://alcs.example.com/metrics | grep alcs_errors_total
```

**Step 6: Document**

Create incident report:
```markdown
# Incident Report: <Date> - <Title>

## Summary
Brief description of what happened.

## Timeline
- 10:00: Issue detected
- 10:05: Investigation started
- 10:15: Root cause identified
- 10:30: Fix deployed
- 10:45: Resolution verified

## Root Cause
Detailed explanation of what caused the issue.

## Impact
- Duration: 45 minutes
- Affected users: ~200
- Data loss: None
- Revenue impact: $X

## Resolution
Steps taken to resolve the issue.

## Prevention
Actions to prevent recurrence:
1. Improve monitoring
2. Add automated tests
3. Update runbook
```

## Common Issues

### Issue 1: Pods CrashLooping

**Symptoms:**
- Pods constantly restarting
- `kubectl get pods` shows CrashLoopBackOff
- Health check failures

**Diagnosis:**
```bash
# Check pod status
kubectl get pods -n alcs

# Check pod events
kubectl describe pod -n alcs <pod-name>

# Check pod logs
kubectl logs -n alcs <pod-name> --previous

# Check resource limits
kubectl top pods -n alcs
```

**Common Causes:**

**1. Database Connection Failed**
```bash
# Verify database is running
kubectl get pods -n alcs -l app=postgres

# Test database connection
kubectl exec -n alcs postgres-0 -- psql -U alcs -c "SELECT 1"

# Check DATABASE_URL secret
kubectl get secret -n alcs alcs-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# Fix: Update DATABASE_URL if incorrect
kubectl edit secret -n alcs alcs-secrets
kubectl rollout restart deployment/alcs -n alcs
```

**2. Out of Memory (OOM)**
```bash
# Check if pod was OOMKilled
kubectl describe pod -n alcs <pod-name> | grep -i oom

# Increase memory limits
kubectl edit deployment -n alcs alcs
# Change:
#   resources:
#     limits:
#       memory: 4Gi  # Increase from 2Gi

# Apply changes
kubectl apply -f k8s/deployment.yaml
```

**3. Missing Environment Variables**
```bash
# Check ConfigMap
kubectl get configmap -n alcs alcs-config -o yaml

# Check Secret
kubectl get secret -n alcs alcs-secrets -o jsonpath='{.data}' | jq

# Fix: Add missing variables
kubectl edit configmap -n alcs alcs-config
kubectl rollout restart deployment/alcs -n alcs
```

**4. Invalid Configuration**
```bash
# Check application logs for config errors
kubectl logs -n alcs <pod-name> | grep -i "config\|invalid\|error"

# Validate configuration
kubectl exec -n alcs <pod-name> -- node -e \
  "console.log(require('./dist/config').validateConfig())"

# Fix: Update configuration
kubectl edit configmap -n alcs alcs-config
```

### Issue 2: High Latency / Slow Performance

**Symptoms:**
- Request duration >1s
- Timeout errors
- Slow API responses

**Diagnosis:**
```bash
# Check current latency
curl -w "@curl-format.txt" https://alcs.example.com/health

# curl-format.txt:
# time_namelookup:  %{time_namelookup}s
# time_connect:     %{time_connect}s
# time_appconnect:  %{time_appconnect}s
# time_pretransfer: %{time_pretransfer}s
# time_starttransfer: %{time_starttransfer}s
# time_total:       %{time_total}s

# Check metrics
curl -s https://alcs.example.com/metrics | \
  grep alcs_request_duration_seconds

# Check database query performance
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Common Causes:**

**1. Database Slow Queries**
```bash
# Enable query logging
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "ALTER SYSTEM SET log_min_duration_statement = 1000;"  # Log queries >1s

# Check slow query log
kubectl logs -n alcs postgres-0 | grep "duration:"

# Add missing indexes
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "CREATE INDEX CONCURRENTLY idx_sessions_status ON sessions(status);"

# Vacuum database
kubectl exec -n alcs postgres-0 -- psql -U alcs -c "VACUUM ANALYZE;"
```

**2. High CPU Usage**
```bash
# Check CPU usage
kubectl top pods -n alcs

# Scale up if CPU >80%
kubectl scale deployment alcs -n alcs --replicas=6

# Or let HPA handle it
kubectl get hpa -n alcs

# Check for CPU-intensive operations
kubectl logs -n alcs <pod-name> | grep "iteration\|analysis\|processing"
```

**3. Memory Pressure**
```bash
# Check memory usage
kubectl top pods -n alcs

# Check cache size
curl -s https://alcs.example.com/metrics | grep alcs_cache_size

# Clear cache if too large
kubectl exec -n alcs <pod-name> -- \
  node -e "require('./dist/services/cacheService').default.clear()"

# Adjust cache settings
kubectl edit configmap -n alcs alcs-config
# Change CACHE_MAX_ITEMS or CACHE_DEFAULT_TTL
```

**4. External API Latency (LLM)**
```bash
# Check LLM API latency
curl -s https://alcs.example.com/metrics | \
  grep alcs_llm_request_duration

# Check if rate limited by provider
kubectl logs -n alcs -l app=alcs | grep "rate.limit\|429"

# Implement request queuing or backoff
# (requires code changes)
```

**5. Network Issues**
```bash
# Check network latency
kubectl exec -n alcs <pod-name> -- ping -c 5 postgres
kubectl exec -n alcs <pod-name> -- ping -c 5 redis

# Check DNS resolution
kubectl exec -n alcs <pod-name> -- nslookup postgres
kubectl exec -n alcs <pod-name> -- nslookup api.anthropic.com

# Check NetworkPolicy
kubectl get networkpolicy -n alcs -o yaml
```

### Issue 3: High Error Rate

**Symptoms:**
- Increased 5xx errors
- Failed API calls
- Alert: "ALCSHighErrorRate"

**Diagnosis:**
```bash
# Check error count
curl -s https://alcs.example.com/metrics | grep alcs_errors_total

# Check error types
kubectl logs -n alcs -l app=alcs --tail=1000 | \
  grep -i error | awk '{print $5}' | sort | uniq -c | sort -rn

# Check specific error logs
kubectl logs -n alcs -l app=alcs | grep -A5 "ERROR"
```

**Common Causes:**

**1. Database Connection Pool Exhausted**
```bash
# Check active connections
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Check connection pool settings
kubectl exec -n alcs <pod-name> -- \
  node -e "console.log(process.env.DATABASE_URL)"

# Increase pool size
kubectl edit configmap -n alcs alcs-config
# Add: DATABASE_POOL_MAX=50
kubectl rollout restart deployment/alcs -n alcs
```

**2. LLM API Errors**
```bash
# Check LLM error count
kubectl logs -n alcs -l app=alcs | grep "Anthropic\|OpenAI" | grep -i error

# Common issues:
# - Invalid API key
# - Rate limit exceeded
# - Model not found
# - Timeout

# Verify API key
kubectl get secret -n alcs alcs-secrets -o jsonpath='{.data.ANTHROPIC_API_KEY}' | base64 -d

# Test API manually
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

**3. Validation Errors**
```bash
# Check validation failures
kubectl logs -n alcs -l app=alcs | grep "Validation failed"

# Common issues:
# - Invalid input format
# - Missing required fields
# - Security violations (SQL injection attempts)

# Review validation rules
kubectl exec -n alcs <pod-name> -- \
  cat /app/dist/services/validationService.js | grep -A20 "validateToolArgs"

# Adjust if false positives
kubectl edit configmap -n alcs alcs-config
```

**4. Uncaught Exceptions**
```bash
# Check for uncaught exceptions
kubectl logs -n alcs -l app=alcs | grep "Uncaught\|Unhandled"

# Enable crash reporting
# Add to application code:
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  // Send to error tracking service (Sentry, Rollbar)
});

# Deploy fix
# Update code and redeploy
```

### Issue 4: Authentication Failures

**Symptoms:**
- 401 Unauthorized errors
- JWT validation failures
- Invalid API key errors

**Diagnosis:**
```bash
# Check authentication logs
kubectl logs -n alcs -l app=alcs | grep -i "auth\|401\|unauthorized"

# Check API key configuration
kubectl get secret -n alcs alcs-secrets -o jsonpath='{.data.API_KEY}' | base64 -d

# Check JWT secret
kubectl get secret -n alcs alcs-secrets -o jsonpath='{.data.JWT_SECRET}' | base64 -d

# Test authentication
curl -H "Authorization: Bearer <api-key>" https://alcs.example.com/health
```

**Common Causes:**

**1. Expired JWT Token**
```bash
# Check token expiration
# Decode JWT (use jwt.io or)
echo "<token>" | cut -d'.' -f2 | base64 -d | jq

# Generate new token
npm run auth:generate-jwt-token <user-id>

# Or increase expiration
kubectl edit secret -n alcs alcs-secrets
# Change JWT_EXPIRES_IN=7d  # 7 days instead of 24h
kubectl rollout restart deployment/alcs -n alcs
```

**2. API Key Mismatch**
```bash
# Regenerate API key
npm run auth:generate-api-key

# Update secret
kubectl create secret generic alcs-secrets \
  --from-literal=API_KEY=<new-key> \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl rollout restart deployment/alcs -n alcs

# Update clients with new key
```

**3. Clock Skew**
```bash
# Check server time
kubectl exec -n alcs <pod-name> -- date

# Check time sync
kubectl exec -n alcs <pod-name> -- timedatectl status

# Fix time sync (on node)
sudo timedatectl set-ntp true
sudo systemctl restart systemd-timesyncd
```

### Issue 5: Rate Limiting Issues

**Symptoms:**
- Legitimate users getting 429 errors
- Rate limit not triggering for abuse

**Diagnosis:**
```bash
# Check rate limit violations
kubectl logs -n alcs -l app=alcs | grep "Rate limit exceeded"

# Check rate limit metrics
curl -s https://alcs.example.com/metrics | grep alcs_rate_limit

# Check current limits
kubectl get configmap -n alcs alcs-config -o yaml | grep RATE_LIMIT
```

**Solutions:**

**1. Adjust Rate Limits**
```bash
# Increase limits for legitimate users
kubectl edit configmap -n alcs alcs-config
# Change:
#   RATE_LIMIT_MAX_REQUESTS: "200"  # Increase from 100
#   RATE_LIMIT_WINDOW_MS: "60000"   # Keep at 1 minute

kubectl rollout restart deployment/alcs -n alcs
```

**2. Whitelist Specific Users/IPs**
```bash
# Add to configuration
kubectl edit configmap -n alcs alcs-config
# Add:
#   RATE_LIMIT_WHITELIST: "user:admin,ip:192.168.1.100"

# Or disable for specific endpoints
# (requires code changes)
```

**3. Use Separate Limits for Different Endpoints**
```bash
# Edit rate limiting service
# Set namespace-based limits:
# - /health: 1000 req/min (monitoring)
# - /api: 100 req/min (general)
# - /expensive: 10 req/min (resource-intensive)
```

## Maintenance Procedures

### Routine Maintenance

**Weekly Tasks:**
1. Review error logs and metrics
2. Check disk space and cleanup old logs
3. Test backup restore procedure
4. Update dependencies (security patches)
5. Review and rotate credentials

**Monthly Tasks:**
1. Full security audit
2. Performance review and optimization
3. Capacity planning review
4. Disaster recovery drill
5. Documentation updates

### Updating ALCS

**Step 1: Preparation**
```bash
# Review changelog
git log --oneline v1.0.0..v1.1.0

# Check breaking changes
grep -i "breaking" CHANGELOG.md

# Backup current state
kubectl exec -n alcs postgres-0 -- \
  pg_dump -U alcs alcs > backup-pre-upgrade-$(date +%Y%m%d).sql

# Tag current deployment
kubectl annotate deployment alcs -n alcs \
  deployment.kubernetes.io/revision="pre-v1.1.0-$(date +%Y%m%d)"
```

**Step 2: Deploy to Staging**
```bash
# Update staging environment first
kubectl set image deployment/alcs -n alcs-staging \
  alcs=your-registry/alcs:1.1.0

# Run integration tests
npm run test:integration -- --env=staging

# Monitor for 24 hours
# Check error rates, performance, logs
```

**Step 3: Deploy to Production**
```bash
# Update image tag
kubectl set image deployment/alcs -n alcs \
  alcs=your-registry/alcs:1.1.0

# Watch rollout
kubectl rollout status deployment/alcs -n alcs

# Monitor metrics
watch -n 5 'curl -s https://alcs.example.com/metrics | grep alcs_errors_total'

# If issues, rollback immediately
kubectl rollout undo deployment/alcs -n alcs
```

**Step 4: Post-Deployment**
```bash
# Verify health
curl https://alcs.example.com/health

# Check logs
kubectl logs -n alcs -l app=alcs --tail=100

# Monitor for 1 hour
# Watch dashboards for anomalies
```

### Database Maintenance

**Vacuum and Analyze:**
```bash
# Weekly maintenance
kubectl exec -n alcs postgres-0 -- psql -U alcs -c "VACUUM ANALYZE;"

# Check bloat
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

**Reindex:**
```bash
# Monthly reindex (causes brief downtime)
kubectl exec -n alcs postgres-0 -- psql -U alcs -c "REINDEX DATABASE alcs;"

# Or reindex concurrently (no downtime)
kubectl exec -n alcs postgres-0 -- psql -U alcs -c "REINDEX INDEX CONCURRENTLY idx_sessions_status;"
```

**Cleanup Old Data:**
```bash
# Delete sessions older than 90 days
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '90 days';"

# Check disk usage
kubectl exec -n alcs postgres-0 -- df -h /var/lib/postgresql/data
```

### Certificate Renewal

**Let's Encrypt (Automated with cert-manager):**
```bash
# Check certificate expiration
kubectl get certificate -n alcs

# Renew manually if needed
kubectl delete certificate alcs-tls -n alcs
kubectl apply -f k8s/ingress.yaml

# Verify renewal
kubectl describe certificate alcs-tls -n alcs
```

**Manual Certificate:**
```bash
# Check expiration
openssl x509 -in /etc/ssl/certs/alcs.crt -noout -dates

# Renew certificate
# (depends on your CA)

# Update secret
kubectl create secret tls alcs-tls \
  --cert=/path/to/new/cert.crt \
  --key=/path/to/new/key.key \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart ingress
kubectl rollout restart deployment ingress-nginx-controller -n ingress-nginx
```

### Scaling Operations

**Scale Up:**
```bash
# Manual scale
kubectl scale deployment alcs -n alcs --replicas=6

# Or adjust HPA
kubectl edit hpa alcs -n alcs
# Change maxReplicas: 15

# Monitor scaling
watch kubectl get pods -n alcs
```

**Scale Down:**
```bash
# Disable HPA first
kubectl delete hpa alcs -n alcs

# Manual scale
kubectl scale deployment alcs -n alcs --replicas=2

# Re-enable HPA
kubectl apply -f k8s/hpa.yaml
```

## Emergency Procedures

### Complete Service Outage

**Immediate Actions:**
```bash
# 1. Verify outage
curl https://alcs.example.com/health

# 2. Check all pods
kubectl get pods -n alcs

# 3. Check events
kubectl get events -n alcs --sort-by='.lastTimestamp'

# 4. Check nodes
kubectl get nodes

# 5. Check cluster status
kubectl cluster-info
```

**Recovery Steps:**

**If Database is Down:**
```bash
# Check database pod
kubectl get pods -n alcs -l app=postgres

# Check database logs
kubectl logs -n alcs postgres-0 --tail=100

# Restart database
kubectl delete pod -n alcs postgres-0

# Wait for recovery
kubectl wait --for=condition=ready pod -l app=postgres -n alcs --timeout=300s
```

**If All Pods are CrashLooping:**
```bash
# Emergency rollback
kubectl rollout undo deployment/alcs -n alcs

# Or scale to 0 and back up
kubectl scale deployment alcs -n alcs --replicas=0
kubectl scale deployment alcs -n alcs --replicas=3
```

**If Node is Down:**
```bash
# Check node status
kubectl get nodes

# Drain node
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Pods will reschedule to healthy nodes automatically
```

### Data Corruption

**Immediate Actions:**
```bash
# 1. Stop writes immediately
kubectl scale deployment alcs -n alcs --replicas=0

# 2. Backup current state
kubectl exec -n alcs postgres-0 -- \
  pg_dump -U alcs alcs > backup-corruption-$(date +%Y%m%d-%H%M%S).sql

# 3. Assess damage
kubectl exec -n alcs postgres-0 -- psql -U alcs -c \
  "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 100;"

# 4. Restore from backup
kubectl exec -i -n alcs postgres-0 -- \
  psql -U alcs alcs < backup-latest-good.sql

# 5. Restart service
kubectl scale deployment alcs -n alcs --replicas=3
```

### Security Breach

**Immediate Actions:**
```bash
# 1. Isolate affected systems
kubectl delete ingress alcs -n alcs  # Block external access

# 2. Collect evidence
kubectl logs -n alcs -l app=alcs --since=24h > incident-logs.txt
kubectl get events -n alcs > incident-events.txt

# 3. Rotate all credentials
npm run auth:generate-api-key
kubectl create secret generic alcs-secrets \
  --from-literal=API_KEY=<new-key> \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Review access logs
kubectl logs -n alcs -l app=alcs | grep "401\|403" | \
  awk '{print $10}' | sort | uniq -c | sort -rn

# 5. Patch vulnerabilities
# Update to latest version
kubectl set image deployment/alcs -n alcs alcs=your-registry/alcs:latest

# 6. Restore service
kubectl apply -f k8s/ingress.yaml
```

## Monitoring and Alerting

### Critical Alerts

Configure these alerts in Prometheus/AlertManager:

**1. Service Down:**
```yaml
- alert: ALCSServiceDown
  expr: up{job="alcs"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "ALCS service is down"
    description: "No ALCS pods are reachable"
```

**2. High Error Rate:**
```yaml
- alert: ALCSHighErrorRate
  expr: rate(alcs_errors_total[5m]) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High error rate detected"
```

**3. Pod CrashLooping:**
```yaml
- alert: ALCSPodCrashLooping
  expr: rate(kube_pod_container_status_restarts_total{pod=~"alcs-.*"}[15m]) > 0
  for: 5m
  labels:
    severity: critical
```

**4. Database Connection Issues:**
```yaml
- alert: ALCSDatabaseConnectionFailures
  expr: rate(alcs_database_errors_total[5m]) > 0.01
  for: 5m
  labels:
    severity: critical
```

### Metrics to Monitor

**Health Metrics:**
- `up`: Service availability (target: 1)
- `alcs_sessions_active`: Active sessions (watch for spikes)
- `alcs_errors_total`: Total errors (target: <1% of requests)

**Performance Metrics:**
- `alcs_request_duration_seconds`: Request latency (p95 < 1s)
- `alcs_llm_request_duration_seconds`: LLM API latency (p95 < 5s)
- `alcs_database_query_duration_seconds`: DB query time (p95 < 100ms)

**Resource Metrics:**
- `container_memory_usage_bytes`: Memory usage (< 80% of limit)
- `container_cpu_usage_seconds_total`: CPU usage (< 70% of limit)
- `alcs_cache_size_bytes`: Cache size (< max configured)

**Business Metrics:**
- `alcs_sessions_total`: Total sessions created
- `alcs_llm_tokens_total`: Token usage (for cost tracking)
- `alcs_rate_limit_exceeded_total`: Rate limit violations

## Contact Information

**On-Call Rotation:**
- Primary: [Name] <email> [phone]
- Secondary: [Name] <email> [phone]
- Escalation: [Manager] <email> [phone]

**External Contacts:**
- Cloud Provider Support: [contact]
- Database DBA: [contact]
- Security Team: [contact]
- LLM Provider Support: [contact]

**Communication Channels:**
- Slack: #alcs-incidents
- PagerDuty: [integration]
- Status Page: https://status.example.com

## Additional Resources

- [Production Deployment Guide](PRODUCTION-DEPLOYMENT.md)
- [Security Hardening Guide](SECURITY-HARDENING.md)
- [Monitoring & Alerting Guide](MONITORING-ALERTING.md)
- [Architecture Documentation](../README.md)
