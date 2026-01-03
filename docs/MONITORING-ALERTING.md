# ALCS Monitoring & Alerting Guide

This guide covers monitoring, metrics, alerting, and observability for ALCS in production.

## Table of Contents

- [Overview](#overview)
- [Metrics](#metrics)
- [Prometheus Setup](#prometheus-setup)
- [Grafana Dashboards](#grafana-dashboards)
- [Alerting Rules](#alerting-rules)
- [Log Aggregation](#log-aggregation)
- [Distributed Tracing](#distributed-tracing)
- [Performance Monitoring](#performance-monitoring)

## Overview

### Observability Stack

ALCS uses a comprehensive observability stack:

```
┌─────────────────────────────────────────┐
│            ALCS Application             │
│  - Prometheus metrics (/metrics)        │
│  - Structured JSON logs                 │
│  - Trace context (correlation IDs)      │
└─────────┬───────────────────────────────┘
          │
          ├──────────────────┐
          │                  │
┌─────────▼─────────┐  ┌────▼──────────┐
│    Prometheus     │  │  Log Collector│
│   (Metrics)       │  │  (Loki/ELK)   │
└─────────┬─────────┘  └────┬──────────┘
          │                  │
          └──────────┬───────┘
                     │
          ┌──────────▼──────────┐
          │      Grafana        │
          │  (Visualization)    │
          └─────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   AlertManager      │
          │   (Notifications)   │
          └─────────────────────┘
```

### Monitoring Goals

1. **Availability**: Is the service up and responsive?
2. **Performance**: Is the service fast enough?
3. **Errors**: Are there errors and what types?
4. **Capacity**: Do we need to scale?
5. **Security**: Are there security incidents?
6. **Business**: How is the service being used?

## Metrics

### Metrics Exposed

ALCS exposes Prometheus metrics on port 9090 at `/metrics`:

```bash
# Access metrics
curl http://localhost:9090/metrics
```

### Application Metrics

**Session Metrics:**
```prometheus
# Gauge: Current active sessions
alcs_sessions_active 42

# Counter: Total sessions created
alcs_sessions_total{status="success"} 1234
alcs_sessions_total{status="error"} 56

# Histogram: Session duration
alcs_session_duration_seconds_bucket{le="1"} 100
alcs_session_duration_seconds_bucket{le="5"} 450
alcs_session_duration_seconds_bucket{le="10"} 890
alcs_session_duration_seconds_sum 5432.1
alcs_session_duration_seconds_count 1000
```

**Request Metrics:**
```prometheus
# Counter: Total HTTP requests
alcs_http_requests_total{method="POST",path="/api/sessions",status="200"} 5678

# Histogram: Request duration
alcs_http_request_duration_seconds_bucket{method="POST",path="/api/sessions",le="0.1"} 4500
alcs_http_request_duration_seconds_bucket{method="POST",path="/api/sessions",le="0.5"} 5500
alcs_http_request_duration_seconds_bucket{method="POST",path="/api/sessions",le="1"} 5650
alcs_http_request_duration_seconds_sum 1234.5
alcs_http_request_duration_seconds_count 5678

# Summary: Request size
alcs_http_request_size_bytes{quantile="0.5"} 256
alcs_http_request_size_bytes{quantile="0.9"} 1024
alcs_http_request_size_bytes{quantile="0.99"} 4096
```

**Error Metrics:**
```prometheus
# Counter: Total errors
alcs_errors_total{type="database",severity="high"} 12
alcs_errors_total{type="llm_api",severity="medium"} 45
alcs_errors_total{type="validation",severity="low"} 234

# Counter: Authentication failures
alcs_authentication_failures_total{reason="invalid_api_key"} 23
alcs_authentication_failures_total{reason="expired_jwt"} 67
```

**LLM Metrics:**
```prometheus
# Counter: LLM API calls
alcs_llm_requests_total{model="claude-3-5-sonnet",status="success"} 3456

# Counter: Token usage
alcs_llm_tokens_total{model="claude-3-5-sonnet",type="input"} 1234567
alcs_llm_tokens_total{model="claude-3-5-sonnet",type="output"} 567890

# Histogram: LLM request duration
alcs_llm_request_duration_seconds_bucket{model="claude-3-5-sonnet",le="1"} 100
alcs_llm_request_duration_seconds_bucket{model="claude-3-5-sonnet",le="5"} 2500
alcs_llm_request_duration_seconds_bucket{model="claude-3-5-sonnet",le="10"} 3400

# Gauge: Estimated cost
alcs_llm_cost_dollars_total{model="claude-3-5-sonnet"} 123.45
```

**Cache Metrics:**
```prometheus
# Counter: Cache operations
alcs_cache_hits_total 8765
alcs_cache_misses_total 1234

# Gauge: Cache size
alcs_cache_size_bytes 12345678
alcs_cache_items 456

# Histogram: Cache operation duration
alcs_cache_operation_duration_seconds{operation="get"}_bucket{le="0.001"} 8000
alcs_cache_operation_duration_seconds{operation="set"}_bucket{le="0.001"} 500
```

**Rate Limiting Metrics:**
```prometheus
# Counter: Rate limit violations
alcs_rate_limit_exceeded_total{endpoint="/api/sessions",identifier_type="ip"} 234

# Gauge: Current rate limit usage
alcs_rate_limit_current_usage{endpoint="/api/sessions",identifier="user:admin"} 45
```

**Database Metrics:**
```prometheus
# Counter: Database queries
alcs_database_queries_total{operation="select"} 12345
alcs_database_queries_total{operation="insert"} 567
alcs_database_queries_total{operation="update"} 234

# Histogram: Query duration
alcs_database_query_duration_seconds_bucket{operation="select",le="0.01"} 10000
alcs_database_query_duration_seconds_bucket{operation="select",le="0.1"} 12000
alcs_database_query_duration_seconds_bucket{operation="select",le="1"} 12300

# Gauge: Connection pool
alcs_database_pool_active_connections 8
alcs_database_pool_idle_connections 12
alcs_database_pool_total_connections 20
```

### System Metrics

**Process Metrics (from prom-client default metrics):**
```prometheus
# Gauge: Memory usage
process_resident_memory_bytes 134217728

# Gauge: CPU usage
process_cpu_user_seconds_total 1234.56
process_cpu_system_seconds_total 567.89

# Gauge: Event loop lag
nodejs_eventloop_lag_seconds 0.002

# Gauge: Heap usage
nodejs_heap_size_used_bytes 45678901
nodejs_heap_size_total_bytes 67890123

# Counter: Garbage collection
nodejs_gc_duration_seconds_count{kind="major"} 45
nodejs_gc_duration_seconds_sum{kind="major"} 12.34
```

**Kubernetes Metrics (from kubelet):**
```prometheus
# Container CPU
container_cpu_usage_seconds_total{pod="alcs-xxx"}

# Container memory
container_memory_usage_bytes{pod="alcs-xxx"}
container_memory_working_set_bytes{pod="alcs-xxx"}

# Container network
container_network_receive_bytes_total{pod="alcs-xxx"}
container_network_transmit_bytes_total{pod="alcs-xxx"}

# Container filesystem
container_fs_usage_bytes{pod="alcs-xxx"}
```

## Prometheus Setup

### Installation (Kubernetes)

**Using Helm (Recommended):**
```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi \
  --set grafana.adminPassword=<strong-password>

# Verify installation
kubectl get pods -n monitoring
```

**Manual Installation:**
```bash
# Create namespace
kubectl create namespace monitoring

# Deploy Prometheus Operator
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/bundle.yaml

# Deploy Prometheus instance
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 2
  retention: 30d
  storage:
    volumeClaimTemplate:
      spec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 50Gi
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels:
      prometheus: kube-prometheus
  ruleSelector:
    matchLabels:
      prometheus: kube-prometheus
EOF
```

### ServiceMonitor Configuration

**Deploy ALCS ServiceMonitor:**
```bash
# Already included in k8s/servicemonitor.yaml
kubectl apply -f k8s/servicemonitor.yaml
```

**Verify Scraping:**
```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Open http://localhost:9090
# Navigate to Status > Targets
# Find "alcs/alcs/0" target (should be UP)

# Query metrics
# alcs_sessions_active
# rate(alcs_http_requests_total[5m])
```

### Prometheus Configuration

**Scrape Configuration:**
```yaml
# prometheus.yml
global:
  scrape_interval: 30s
  scrape_timeout: 10s
  evaluation_interval: 30s

scrape_configs:
- job_name: 'alcs'
  kubernetes_sd_configs:
  - role: pod
    namespaces:
      names:
      - alcs
  relabel_configs:
  - source_labels: [__meta_kubernetes_pod_label_app]
    action: keep
    regex: alcs
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: true
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
    action: replace
    target_label: __address__
    regex: (.+):(.+);(.+)
    replacement: ${1}:${3}
```

**Recording Rules:**
```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: alcs-recording-rules
  namespace: monitoring
spec:
  groups:
  - name: alcs.recording
    interval: 30s
    rules:
    # Request rate (per second)
    - record: alcs:http_requests:rate5m
      expr: rate(alcs_http_requests_total[5m])

    # Error rate
    - record: alcs:errors:rate5m
      expr: rate(alcs_errors_total[5m])

    # P95 latency
    - record: alcs:http_request_duration:p95
      expr: histogram_quantile(0.95, rate(alcs_http_request_duration_seconds_bucket[5m]))

    # Cache hit rate
    - record: alcs:cache:hit_rate
      expr: alcs_cache_hits_total / (alcs_cache_hits_total + alcs_cache_misses_total)

    # Token usage rate
    - record: alcs:llm_tokens:rate1h
      expr: rate(alcs_llm_tokens_total[1h])
```

## Grafana Dashboards

### Installation

**Access Grafana:**
```bash
# Get Grafana password (if using Helm)
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath="{.data.admin-password}" | base64 -d; echo

# Port-forward Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Open http://localhost:3000
# Login: admin / <password>
```

### ALCS Overview Dashboard

**Import Dashboard:**
```bash
# Dashboard JSON is at: monitoring/grafana-dashboard.json
# Import via Grafana UI:
# 1. Click "+" > "Import"
# 2. Upload monitoring/grafana-dashboard.json
# 3. Select Prometheus datasource
# 4. Click "Import"
```

**Dashboard Panels:**

**1. Service Health Row:**
- Uptime (single stat)
- Active Sessions (gauge)
- Request Rate (graph)
- Error Rate (graph)

**2. Performance Row:**
- P50/P95/P99 Latency (graph)
- Request Duration Heatmap
- Database Query Duration (graph)
- LLM Request Duration (graph)

**3. Resources Row:**
- CPU Usage (graph)
- Memory Usage (graph)
- Network I/O (graph)
- Disk I/O (graph)

**4. Application Row:**
- Cache Hit Rate (single stat)
- Rate Limit Violations (graph)
- Authentication Failures (graph)
- Active Database Connections (gauge)

**5. Business Row:**
- Total Sessions Created (counter)
- Token Usage (graph)
- Estimated Cost (single stat)
- Top Users by Request Count (table)

### Custom Dashboards

**Create Performance Dashboard:**
```json
{
  "dashboard": {
    "title": "ALCS Performance",
    "panels": [
      {
        "title": "Request Duration (P95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(alcs_http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{method}} {{path}}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Requests per Second",
        "targets": [
          {
            "expr": "rate(alcs_http_requests_total[5m])",
            "legendFormat": "{{method}} {{path}} {{status}}"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
```

**Create Cost Dashboard:**
```json
{
  "dashboard": {
    "title": "ALCS Cost Analysis",
    "panels": [
      {
        "title": "Total Cost",
        "targets": [
          {
            "expr": "alcs_llm_cost_dollars_total",
            "legendFormat": "{{model}}"
          }
        ],
        "type": "stat"
      },
      {
        "title": "Cost per Hour",
        "targets": [
          {
            "expr": "rate(alcs_llm_cost_dollars_total[1h]) * 3600",
            "legendFormat": "{{model}}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Tokens per Request",
        "targets": [
          {
            "expr": "rate(alcs_llm_tokens_total[5m]) / rate(alcs_llm_requests_total[5m])",
            "legendFormat": "{{model}} {{type}}"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
```

## Alerting Rules

### Prometheus AlertManager

**Install AlertManager:**
```bash
# Included with kube-prometheus-stack
# Or install separately:
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m

    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'team-email'
      routes:
      - match:
          severity: critical
        receiver: 'pagerduty'
      - match:
          severity: warning
        receiver: 'slack'

    receivers:
    - name: 'team-email'
      email_configs:
      - to: 'team@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alertmanager@example.com'
        auth_password: '<password>'

    - name: 'slack'
      slack_configs:
      - api_url: 'https://hooks.slack.com/services/xxx'
        channel: '#alcs-alerts'
        title: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}\n{{ end }}'

    - name: 'pagerduty'
      pagerduty_configs:
      - service_key: '<pagerduty-integration-key>'
EOF
```

### Alert Rules

**Critical Alerts:**

```yaml
# k8s/prometheus-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: alcs-alerts
  namespace: monitoring
  labels:
    prometheus: kube-prometheus
spec:
  groups:
  - name: alcs.critical
    interval: 30s
    rules:
    # Service down
    - alert: ALCSServiceDown
      expr: up{job="alcs"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "ALCS service is down"
        description: "ALCS service has been down for more than 1 minute"

    # High error rate
    - alert: ALCSHighErrorRate
      expr: rate(alcs_errors_total[5m]) > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate detected"
        description: "Error rate is {{ $value | humanize }} errors/sec"

    # Database connection failures
    - alert: ALCSDatabaseConnectionFailures
      expr: rate(alcs_database_errors_total{type="connection"}[5m]) > 0.01
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Database connection failures"
        description: "Database connection failure rate: {{ $value | humanize }}/sec"

    # Pod crash looping
    - alert: ALCSPodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total{pod=~"alcs-.*"}[15m]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Pod is crash looping"
        description: "Pod {{ $labels.pod }} is restarting frequently"

    # Out of memory
    - alert: ALCSHighMemoryUsage
      expr: |
        (container_memory_usage_bytes{pod=~"alcs-.*"} /
         container_spec_memory_limit_bytes{pod=~"alcs-.*"}) > 0.9
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High memory usage"
        description: "Memory usage is {{ $value | humanizePercentage }}"
```

**Warning Alerts:**

```yaml
  - name: alcs.warning
    interval: 30s
    rules:
    # High latency
    - alert: ALCSHighLatency
      expr: histogram_quantile(0.95, rate(alcs_http_request_duration_seconds_bucket[5m])) > 1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High request latency"
        description: "P95 latency is {{ $value | humanize }}s"

    # High CPU usage
    - alert: ALCSHighCPUUsage
      expr: |
        (rate(container_cpu_usage_seconds_total{pod=~"alcs-.*"}[5m]) /
         container_spec_cpu_quota{pod=~"alcs-.*"} *
         container_spec_cpu_period{pod=~"alcs-.*"}) > 0.8
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High CPU usage"
        description: "CPU usage is {{ $value | humanizePercentage }}"

    # Cache hit rate low
    - alert: ALCSLowCacheHitRate
      expr: |
        (alcs_cache_hits_total /
         (alcs_cache_hits_total + alcs_cache_misses_total)) < 0.5
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "Low cache hit rate"
        description: "Cache hit rate is {{ $value | humanizePercentage }}"

    # High rate limit violations
    - alert: ALCSHighRateLimitViolations
      expr: rate(alcs_rate_limit_exceeded_total[5m]) > 1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High rate limit violations"
        description: "Rate limit violations: {{ $value | humanize }}/sec"

    # Authentication failures
    - alert: ALCSHighAuthenticationFailures
      expr: rate(alcs_authentication_failures_total[5m]) > 0.1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High authentication failure rate"
        description: "Auth failure rate: {{ $value | humanize }}/sec"

    # Database connection pool exhausted
    - alert: ALCSDatabasePoolExhausted
      expr: alcs_database_pool_active_connections >= alcs_database_pool_total_connections
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Database connection pool exhausted"
        description: "All {{ $value }} database connections are in use"
```

**Security Alerts:**

```yaml
  - name: alcs.security
    interval: 30s
    rules:
    # SQL injection attempt
    - alert: ALCSSQLInjectionAttempt
      expr: increase(alcs_sql_injection_attempts_total[5m]) > 0
      labels:
        severity: critical
      annotations:
        summary: "SQL injection attempt detected"
        description: "SQL injection attempt from {{ $labels.ip }}"

    # Path traversal attempt
    - alert: ALCSPathTraversalAttempt
      expr: increase(alcs_path_traversal_attempts_total[5m]) > 0
      labels:
        severity: critical
      annotations:
        summary: "Path traversal attempt detected"
        description: "Path traversal attempt from {{ $labels.ip }}"

    # Brute force attack
    - alert: ALCSBruteForceAttack
      expr: rate(alcs_authentication_failures_total[1m]) > 1
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Possible brute force attack"
        description: "High auth failure rate from {{ $labels.ip }}: {{ $value | humanize }}/sec"
```

**Apply Alert Rules:**
```bash
kubectl apply -f k8s/prometheus-alerts.yaml
```

## Log Aggregation

### Structured Logging

**Log Format:**
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "message": "Request completed",
  "correlationId": "req_abc123",
  "userId": "user123",
  "method": "POST",
  "path": "/api/sessions",
  "status": 200,
  "duration": 234,
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

### Loki Setup (Recommended)

**Install Loki:**
```bash
# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Loki
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set grafana.enabled=false

# Verify
kubectl get pods -n monitoring -l app=loki
```

**Configure Promtail:**
```yaml
# promtail-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
  namespace: monitoring
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080

    positions:
      filename: /tmp/positions.yaml

    clients:
    - url: http://loki:3100/loki/api/v1/push

    scrape_configs:
    - job_name: kubernetes-pods
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: alcs
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_container_name]
        target_label: container
      pipeline_stages:
      - json:
          expressions:
            level: level
            timestamp: timestamp
            message: message
            correlationId: correlationId
      - labels:
          level:
          correlationId:
```

**Query Logs in Grafana:**
```logql
# All logs for ALCS
{namespace="alcs", app="alcs"}

# Error logs only
{namespace="alcs", app="alcs"} |= "error"

# Logs for specific correlation ID
{namespace="alcs", app="alcs"} | json | correlationId="req_abc123"

# Count errors by type
sum(rate({namespace="alcs", app="alcs"} | json | level="error" [5m])) by (type)
```

### ELK Stack Alternative

**Install Elasticsearch:**
```bash
helm install elasticsearch elastic/elasticsearch \
  --namespace monitoring \
  --set replicas=3 \
  --set volumeClaimTemplate.resources.requests.storage=100Gi
```

**Install Filebeat:**
```bash
helm install filebeat elastic/filebeat \
  --namespace monitoring \
  --set daemonset.enabled=true
```

**Install Kibana:**
```bash
helm install kibana elastic/kibana \
  --namespace monitoring
```

**Create Index Pattern:**
```bash
# Access Kibana
kubectl port-forward -n monitoring svc/kibana 5601:5601

# Open http://localhost:5601
# Navigate to Management > Index Patterns
# Create pattern: filebeat-*
# Select timestamp field: @timestamp
```

## Distributed Tracing

### OpenTelemetry Setup

**Install OpenTelemetry Operator:**
```bash
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml
```

**Configure Instrumentation:**
```typescript
// src/tracing.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const provider = new NodeTracerProvider();

provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    })
  )
);

provider.register();

registerInstrumentations({
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});
```

**View Traces in Grafana:**
```bash
# Add Tempo as datasource
# Query traces by trace ID or service name
```

## Performance Monitoring

### Key Performance Indicators (KPIs)

**Availability:**
- Target: 99.9% uptime (43.8 minutes downtime/month)
- Measure: `up{job="alcs"}`

**Latency:**
- Target: P95 < 1s, P99 < 2s
- Measure: `histogram_quantile(0.95, rate(alcs_http_request_duration_seconds_bucket[5m]))`

**Error Rate:**
- Target: < 1% of requests
- Measure: `rate(alcs_errors_total[5m]) / rate(alcs_http_requests_total[5m])`

**Throughput:**
- Target: 100 requests/sec sustained
- Measure: `rate(alcs_http_requests_total[5m])`

### SLI/SLO/SLA

**Service Level Indicators (SLIs):**
```prometheus
# Availability SLI
(sum(up{job="alcs"}) / count(up{job="alcs"})) * 100

# Latency SLI (% of requests < 1s)
(
  sum(rate(alcs_http_request_duration_seconds_bucket{le="1"}[30d])) /
  sum(rate(alcs_http_request_duration_seconds_count[30d]))
) * 100

# Error rate SLI
(
  1 - (
    sum(rate(alcs_errors_total[30d])) /
    sum(rate(alcs_http_requests_total[30d]))
  )
) * 100
```

**Service Level Objectives (SLOs):**
- Availability: 99.9% (monthly)
- Latency: 95% of requests < 1s (monthly)
- Error rate: < 1% of requests (monthly)

**Service Level Agreements (SLAs):**
- Customer-facing commitments
- Include credits/compensation for breaches
- More lenient than internal SLOs

### Performance Benchmarks

**Load Testing:**
```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Linux

# Run load test
k6 run --vus 100 --duration 5m load-test.js

# Example output:
# http_req_duration.........: avg=234ms min=45ms med=180ms max=2.1s p(90)=456ms p(95)=678ms
# http_req_failed...........: 0.23% ✓ 23 ✗ 9977
# http_reqs.................: 10000 33.33/s
```

**Continuous Performance Monitoring:**
```yaml
# .github/workflows/performance.yml
name: Performance Test

on:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2

    - name: Run k6 test
      uses: grafana/k6-action@v0.2.0
      with:
        filename: tests/load-test.js

    - name: Check performance
      run: |
        # Fail if P95 > 1s
        if [ $(cat summary.json | jq '.metrics.http_req_duration.values."p(95)"') -gt 1000 ]; then
          echo "Performance regression detected"
          exit 1
        fi
```

## Troubleshooting

### High Latency

**Diagnosis:**
```promql
# Check which endpoint is slow
topk(5, histogram_quantile(0.95, rate(alcs_http_request_duration_seconds_bucket[5m]))) by (path)

# Check database query performance
topk(5, histogram_quantile(0.95, rate(alcs_database_query_duration_seconds_bucket[5m]))) by (operation)

# Check LLM API latency
histogram_quantile(0.95, rate(alcs_llm_request_duration_seconds_bucket[5m]))
```

### High Error Rate

**Diagnosis:**
```promql
# Errors by type
sum(rate(alcs_errors_total[5m])) by (type)

# Errors by endpoint
sum(rate(alcs_http_requests_total{status=~"5.."}[5m])) by (path)

# Database errors
rate(alcs_database_errors_total[5m])
```

### Memory Leaks

**Diagnosis:**
```promql
# Memory growth over time
deriv(process_resident_memory_bytes[1h])

# Heap size trend
deriv(nodejs_heap_size_used_bytes[1h])

# Event loop lag
nodejs_eventloop_lag_seconds
```

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Loki Documentation](https://grafana.com/docs/loki/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Site Reliability Engineering Book](https://sre.google/books/)
