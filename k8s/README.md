# ALCS Kubernetes Deployment

This directory contains Kubernetes manifests for deploying ALCS in production.

## Prerequisites

- Kubernetes cluster (v1.24+)
- `kubectl` CLI tool
- Container registry with ALCS image
- Persistent storage provisioner
- Ingress controller (NGINX recommended)
- cert-manager (for TLS certificates)
- Prometheus Operator (optional, for ServiceMonitor)

## Quick Start

### 1. Update Configuration

**Edit `secret.yaml`:**
```bash
# Replace all CHANGE_ME_PLEASE values with actual secrets
# IMPORTANT: Never commit secrets to git!

# Generate API key and JWT secret:
openssl rand -base64 32

# Add your LLM API keys
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Edit `kustomization.yaml`:**
```yaml
images:
- name: alcs
  newName: your-registry/alcs  # Your container registry
  newTag: "1.0.0"               # Your image tag
```

**Edit `ingress.yaml`:**
```yaml
- host: alcs.example.com  # Your domain
```

### 2. Deploy

**Option A: Using kubectl:**
```bash
# Apply all manifests
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f postgres.yaml
kubectl apply -f redis.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
kubectl apply -f ingress.yaml
kubectl apply -f networkpolicy.yaml
kubectl apply -f servicemonitor.yaml
```

**Option B: Using Kustomize:**
```bash
# Build and apply
kubectl apply -k .

# Or preview first
kubectl kustomize . | less
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n alcs

# Check services
kubectl get svc -n alcs

# Check ingress
kubectl get ingress -n alcs

# View logs
kubectl logs -n alcs -l app=alcs --tail=50

# Check health
kubectl exec -n alcs deployment/alcs -- \
  curl -s http://localhost:9090/health
```

## Architecture

```
┌─────────────────────────────────────────────┐
│              Ingress (HTTPS)                │
│         alcs.example.com                    │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         ALCS Service (ClusterIP)            │
│         Port 3000 (HTTP)                    │
│         Port 9090 (Metrics)                 │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│      ALCS Deployment (3-10 replicas)        │
│      - HPA enabled (CPU/Memory)             │
│      - PodDisruptionBudget (min 2)          │
│      - Health/Readiness probes              │
└───┬──────────────────────────────────┬──────┘
    │                                  │
┌───▼────────────┐          ┌──────────▼──────┐
│   PostgreSQL   │          │      Redis      │
│  (StatefulSet) │          │   (Deployment)  │
│   Port 5432    │          │    Port 6379    │
└────────────────┘          └─────────────────┘
```

## Resource Manifests

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates `alcs` namespace |
| `rbac.yaml` | ServiceAccount, Role, RoleBinding |
| `configmap.yaml` | Non-sensitive configuration |
| `secret.yaml` | Sensitive credentials (API keys, passwords) |
| `deployment.yaml` | ALCS application deployment |
| `service.yaml` | ClusterIP services for ALCS |
| `hpa.yaml` | HorizontalPodAutoscaler (3-10 replicas) |
| `pdb.yaml` | PodDisruptionBudget (min 2 available) |
| `ingress.yaml` | External HTTPS access |
| `networkpolicy.yaml` | Network security policies |
| `servicemonitor.yaml` | Prometheus metrics scraping |
| `postgres.yaml` | PostgreSQL StatefulSet |
| `redis.yaml` | Redis Deployment |
| `kustomization.yaml` | Kustomize configuration |

## Configuration

### Environment Variables

All configuration is managed through ConfigMap and Secret:

**ConfigMap (non-sensitive):**
- Application settings (PORT, NODE_ENV, LOG_LEVEL)
- Performance limits (MAX_SESSIONS, timeouts)
- Feature flags (ENABLE_AUTHENTICATION, etc.)
- Default values (QUALITY_THRESHOLD, MAX_ITERATIONS)

**Secret (sensitive):**
- Database credentials (POSTGRES_PASSWORD, DATABASE_URL)
- LLM API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY)
- Security tokens (API_KEY, JWT_SECRET)
- Redis connection URL

### Resource Requests/Limits

**ALCS Pods:**
- Requests: 500m CPU, 512Mi memory
- Limits: 2000m CPU, 2Gi memory

**PostgreSQL:**
- Requests: 250m CPU, 512Mi memory
- Limits: 1000m CPU, 1Gi memory

**Redis:**
- Requests: 100m CPU, 256Mi memory
- Limits: 500m CPU, 512Mi memory

### Scaling

**HorizontalPodAutoscaler:**
- Min replicas: 3
- Max replicas: 10
- CPU target: 70%
- Memory target: 80%
- Scale up: Fast (100% or 4 pods per 30s)
- Scale down: Slow (50% or 2 pods per 60s, 5min stabilization)

**Manual scaling:**
```bash
# Scale to 5 replicas
kubectl scale deployment alcs -n alcs --replicas=5

# Disable HPA first:
kubectl delete hpa alcs -n alcs
```

## Security

### RBAC

- ServiceAccount with minimal permissions
- Role limited to reading ConfigMaps and Secrets
- No cluster-level permissions

### Network Policies

- Ingress: Only from ingress-nginx and Prometheus
- Egress: Only to PostgreSQL, Redis, DNS, and HTTPS
- PostgreSQL: Only accessible from ALCS pods
- Redis: Only accessible from ALCS pods

### Pod Security

- Non-root user (UID 1000)
- Read-only root filesystem (where possible)
- Drop all capabilities
- No privilege escalation
- Security context enforced

### TLS/HTTPS

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## Monitoring

### Prometheus Metrics

ALCS exposes metrics on port 9090:

```bash
# Access metrics directly
kubectl port-forward -n alcs svc/alcs 9090:9090
curl http://localhost:9090/metrics
```

**ServiceMonitor:**
- Automatically discovered by Prometheus Operator
- Scrapes `/metrics` every 30 seconds
- Includes all ALCS custom metrics

### Health Checks

**Liveness probe:**
- Endpoint: `/health`
- Initial delay: 30s
- Period: 10s
- Failure threshold: 3

**Readiness probe:**
- Endpoint: `/ready`
- Initial delay: 10s
- Period: 5s
- Failure threshold: 3

**Startup probe:**
- Endpoint: `/health`
- Period: 5s
- Failure threshold: 12 (60s total)

### Logs

```bash
# View logs for all ALCS pods
kubectl logs -n alcs -l app=alcs --tail=100 -f

# View logs for specific pod
kubectl logs -n alcs <pod-name> -f

# View logs from previous pod instance
kubectl logs -n alcs <pod-name> --previous

# Export logs to file
kubectl logs -n alcs -l app=alcs --tail=1000 > alcs.log
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl get pods -n alcs

# Describe pod
kubectl describe pod -n alcs <pod-name>

# Check events
kubectl get events -n alcs --sort-by='.lastTimestamp'

# Check init containers
kubectl logs -n alcs <pod-name> -c wait-for-postgres
```

### Database connection issues

```bash
# Check PostgreSQL is running
kubectl get pods -n alcs -l app=postgres

# Test database connection
kubectl exec -n alcs deployment/postgres -- \
  psql -U alcs -d alcs -c "SELECT 1"

# Check DATABASE_URL secret
kubectl get secret -n alcs alcs-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d
```

### Ingress not working

```bash
# Check ingress status
kubectl get ingress -n alcs

# Describe ingress
kubectl describe ingress -n alcs alcs

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Test service directly
kubectl port-forward -n alcs svc/alcs 3000:3000
curl http://localhost:3000/health
```

### High memory usage

```bash
# Check pod metrics
kubectl top pods -n alcs

# Increase memory limits in deployment.yaml
resources:
  limits:
    memory: 4Gi  # Increase from 2Gi
```

### Scaling issues

```bash
# Check HPA status
kubectl get hpa -n alcs

# Describe HPA
kubectl describe hpa -n alcs alcs

# Check metrics server
kubectl get deployment metrics-server -n kube-system
```

## Maintenance

### Update Configuration

```bash
# Edit ConfigMap
kubectl edit configmap -n alcs alcs-config

# Or apply updated file
kubectl apply -f configmap.yaml

# Restart pods to pick up changes
kubectl rollout restart deployment/alcs -n alcs
```

### Update Secrets

```bash
# Update secret (use kubectl edit or apply)
kubectl edit secret -n alcs alcs-secrets

# Or create new secret
kubectl create secret generic alcs-secrets \
  --from-literal=API_KEY=new-key \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl rollout restart deployment/alcs -n alcs
```

### Rolling Update

```bash
# Update image
kubectl set image deployment/alcs -n alcs \
  alcs=your-registry/alcs:1.1.0

# Watch rollout
kubectl rollout status deployment/alcs -n alcs

# Rollback if needed
kubectl rollout undo deployment/alcs -n alcs
```

### Backup Database

```bash
# Backup PostgreSQL
kubectl exec -n alcs postgres-0 -- \
  pg_dump -U alcs alcs > backup.sql

# Restore
kubectl exec -i -n alcs postgres-0 -- \
  psql -U alcs alcs < backup.sql
```

## Production Checklist

- [ ] Update all `CHANGE_ME_PLEASE` values in secret.yaml
- [ ] Configure custom domain in ingress.yaml
- [ ] Set up TLS certificates (cert-manager + Let's Encrypt)
- [ ] Review resource requests/limits
- [ ] Configure persistent storage for PostgreSQL
- [ ] Set up backup strategy for database
- [ ] Configure monitoring (Prometheus + Grafana)
- [ ] Set up alerting rules
- [ ] Review network policies
- [ ] Test disaster recovery procedures
- [ ] Document runbook procedures
- [ ] Configure log aggregation (ELK/Loki)
- [ ] Set up external secret management (Vault/AWS Secrets Manager)
- [ ] Review security policies
- [ ] Load test the deployment
- [ ] Configure autoscaling thresholds
- [ ] Set up CI/CD pipeline
- [ ] Document incident response procedures

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kustomize Documentation](https://kustomize.io/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Prometheus Operator](https://prometheus-operator.dev/)
