# Monitoring and Observability

## Overview

ShopFlow uses a comprehensive observability stack deployed in the `monitoring`
namespace on EKS (see [kubernetes.md](kubernetes.md)). The stack covers metrics,
logs, traces, and alerting with defined SLOs for each critical service.

## Stack Components

| Component    | Version | Purpose                                | Storage          |
|-------------|---------|----------------------------------------|------------------|
| Prometheus   | 2.50    | Metrics collection and alerting        | 15-day retention |
| Grafana      | 10.3    | Dashboards and visualization           | PostgreSQL       |
| Loki         | 2.9     | Log aggregation                        | S3 (90 days)     |
| Jaeger       | 1.54    | Distributed tracing                    | Elasticsearch    |
| Alertmanager | 0.27    | Alert routing and deduplication        | In-memory        |
| kube-state-metrics | 2.11 | Kubernetes object metrics         | Prometheus       |
| node-exporter | 1.7   | Node-level hardware metrics            | Prometheus       |

## Prometheus Configuration

Prometheus is deployed via the kube-prometheus-stack Helm chart with custom
scrape configurations:

```yaml
# values-prometheus.yaml
prometheus:
  prometheusSpec:
    retention: 15d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          resources:
            requests:
              storage: 200Gi
    resources:
      requests:
        cpu: "2"
        memory: 8Gi
      limits:
        cpu: "4"
        memory: 16Gi
    additionalScrapeConfigs:
      - job_name: istio-mesh
        kubernetes_sd_configs:
          - role: endpoints
            namespaces:
              names: [istio-system]
        relabel_configs:
          - source_labels: [__meta_kubernetes_service_name]
            regex: istio-telemetry
            action: keep
```

## Key Metrics

### Application Metrics

Every ShopFlow service exposes metrics on port 9090 at `/metrics`:

| Metric Name                           | Type      | Description                        |
|--------------------------------------|-----------|------------------------------------|
| `http_requests_total`                 | Counter   | Total HTTP requests by method/status|
| `http_request_duration_seconds`       | Histogram | Request latency distribution       |
| `http_requests_in_flight`             | Gauge     | Current concurrent requests        |
| `db_query_duration_seconds`           | Histogram | Database query latency             |
| `db_connections_active`               | Gauge     | Active database connections        |
| `cache_hits_total`                    | Counter   | Redis cache hits                   |
| `cache_misses_total`                  | Counter   | Redis cache misses                 |
| `order_created_total`                 | Counter   | Orders created (business metric)   |
| `payment_processed_total`             | Counter   | Payments processed by status       |
| `inventory_low_stock`                 | Gauge     | Products below reorder threshold   |

### Infrastructure Metrics

| Metric Name                           | Type      | Source            |
|--------------------------------------|-----------|-------------------|
| `node_cpu_seconds_total`              | Counter   | node-exporter     |
| `node_memory_MemAvailable_bytes`      | Gauge     | node-exporter     |
| `node_disk_io_time_seconds_total`     | Counter   | node-exporter     |
| `kube_pod_status_phase`              | Gauge     | kube-state-metrics|
| `kube_deployment_status_replicas`     | Gauge     | kube-state-metrics|
| `container_cpu_usage_seconds_total`   | Counter   | cAdvisor          |
| `container_memory_working_set_bytes`  | Gauge     | cAdvisor          |

## Alerting Rules

Alerts are defined as PrometheusRule resources and routed through Alertmanager:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: shopflow-alerts
  namespace: monitoring
spec:
  groups:
    - name: availability
      interval: 30s
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
            /
            sum(rate(http_requests_total[5m])) by (service)
            > 0.01
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High 5xx error rate on {{ $labels.service }}"
            description: "Error rate is {{ $value | humanizePercentage }} over the last 5 minutes."
            runbook_url: "https://wiki.shopflow.io/runbooks/high-error-rate"

        - alert: HighLatency
          expr: |
            histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
            > 2.0
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "P99 latency above 2s on {{ $labels.service }}"

        - alert: PodCrashLooping
          expr: |
            increase(kube_pod_container_status_restarts_total[1h]) > 5
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.pod }} is crash-looping"

        - alert: DatabaseConnectionPoolExhausted
          expr: |
            db_connections_active / db_connections_max > 0.9
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Database connection pool near capacity on {{ $labels.service }}"
```

## Alertmanager Routing

```yaml
# alertmanager.yaml
global:
  resolve_timeout: 5m
  slack_api_url: $SLACK_WEBHOOK_URL

route:
  receiver: default
  group_by: [alertname, service]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: pagerduty-critical
      continue: true
    - match:
        severity: critical
      receiver: slack-critical
    - match:
        severity: warning
      receiver: slack-warning

receivers:
  - name: default
    slack_configs:
      - channel: "#shopflow-alerts"
  - name: pagerduty-critical
    pagerduty_configs:
      - service_key: $PAGERDUTY_SERVICE_KEY
        severity: critical
  - name: slack-critical
    slack_configs:
      - channel: "#shopflow-oncall"
        title: "CRITICAL: {{ .GroupLabels.alertname }}"
        color: danger
  - name: slack-warning
    slack_configs:
      - channel: "#shopflow-alerts"
        color: warning
```

For incident escalation procedures, see [runbooks/incident-response.md](runbooks/incident-response.md).

## Grafana Dashboards

Pre-built dashboards are provisioned via ConfigMaps:

| Dashboard                  | Audience        | Key Panels                                     |
|---------------------------|-----------------|-------------------------------------------------|
| Service Overview          | Engineers       | Request rate, error rate, latency percentiles   |
| Kubernetes Cluster        | SRE             | Node CPU/memory, pod counts, restarts           |
| Database Performance      | DBA             | Query latency, connections, replication lag      |
| Business Metrics          | Product/Eng     | Orders/min, revenue, cart abandonment rate       |
| Cache Performance         | Engineers       | Hit ratio, memory usage, eviction rate           |
| Istio Mesh                | SRE             | Service-to-service traffic, mTLS status         |

## SLOs and SLIs

| Service          | SLI                           | SLO Target | Error Budget (30d) |
|-----------------|-------------------------------|------------|-------------------|
| API Gateway      | Availability (non-5xx)       | 99.95%     | 21.6 min          |
| Catalog Service  | P99 latency < 500ms          | 99.9%      | 43.2 min          |
| Order Service    | Availability (non-5xx)       | 99.99%     | 4.3 min           |
| Payment Service  | Success rate (non-failure)   | 99.99%     | 4.3 min           |
| Web Store        | Page load time < 3s (P95)    | 99.5%      | 3.6 hours         |

Error budget consumption is tracked on a dedicated Grafana dashboard and reviewed
weekly by the SRE team. When error budget drops below 25%, a change freeze is
triggered until the budget recovers. See [scaling.md](scaling.md) for capacity
planning tied to SLO targets.

## Log Aggregation

Application logs flow through Loki via Promtail DaemonSet. Structured JSON logging
is enforced across all services:

```json
{
  "timestamp": "2025-01-15T10:30:45.123Z",
  "level": "error",
  "service": "order-service",
  "traceId": "abc123def456",
  "spanId": "789ghi",
  "message": "Payment processing failed",
  "orderId": "ORD-2025-00042",
  "error": "Gateway timeout from payment provider",
  "duration_ms": 30005
}
```

Logs are queried in Grafana using LogQL. Retention: 90 days in S3, 7 days hot
storage in Loki ingesters.

## Distributed Tracing

Jaeger collects traces from all services via OpenTelemetry SDK. Trace sampling
rate is set to 1% in production (100% in staging). Critical paths (payment flow,
order creation) use forced sampling at 100%.
