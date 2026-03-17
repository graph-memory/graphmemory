# Kubernetes Cluster Configuration

## Overview

ShopFlow runs on Amazon EKS v1.29 with managed node groups. The cluster is
provisioned by the Terraform EKS module (see [terraform.md](terraform.md)) and
configured with Helm charts and Kubernetes manifests stored in the `k8s/` directory.

## Cluster Architecture

The cluster uses three namespaces to isolate workloads:

| Namespace    | Purpose                                | Resource Quota (prod) |
|-------------|----------------------------------------|-----------------------|
| `backend`    | API services (catalog, order, payment, gateway) | 16 CPU, 32Gi RAM |
| `frontend`   | Web store, admin panel                | 8 CPU, 16Gi RAM      |
| `monitoring` | Prometheus, Grafana, Loki, Jaeger     | 8 CPU, 24Gi RAM      |
| `istio-system` | Istio control plane                 | 4 CPU, 8Gi RAM       |

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: backend
  labels:
    istio-injection: enabled
    team: platform
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: backend-quota
  namespace: backend
spec:
  hard:
    requests.cpu: "12"
    requests.memory: 24Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    pods: "50"
```

## Deployments

Each microservice follows a standard deployment template. Here is the catalog
service as an example:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: catalog-service
  namespace: backend
  labels:
    app: catalog-service
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: catalog-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: catalog-service
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: catalog-service
      terminationGracePeriodSeconds: 30
      containers:
        - name: catalog-service
          image: 333333333333.dkr.ecr.us-east-1.amazonaws.com/shopflow/catalog-service:abc1234
          ports:
            - containerPort: 3000
              name: http
            - containerPort: 9090
              name: metrics
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: catalog-db-credentials
                  key: connection-string
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-credentials
                  key: url
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
```

## Services

Each deployment is fronted by a ClusterIP service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: catalog-service
  namespace: backend
spec:
  type: ClusterIP
  selector:
    app: catalog-service
  ports:
    - name: http
      port: 80
      targetPort: http
    - name: metrics
      port: 9090
      targetPort: metrics
```

## Ingress

The ALB Ingress Controller manages external access. Path-based routing directs
traffic to the appropriate services:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopflow-ingress
  namespace: backend
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:333333333333:certificate/abc-123
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/healthcheck-path: /health/ready
spec:
  rules:
    - host: api.shopflow.io
      http:
        paths:
          - path: /catalog
            pathType: Prefix
            backend:
              service:
                name: catalog-service
                port:
                  number: 80
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 80
          - path: /payments
            pathType: Prefix
            backend:
              service:
                name: payment-service
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 80
```

## Horizontal Pod Autoscaler

All backend services use HPA based on CPU and custom metrics:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: catalog-service-hpa
  namespace: backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: catalog-service
  minReplicas: 3
  maxReplicas: 15
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 120
```

## Resource Limits by Service

| Service          | CPU Request | CPU Limit | Memory Request | Memory Limit | Min Replicas | Max Replicas |
|-----------------|-------------|-----------|----------------|--------------|--------------|--------------|
| catalog-service  | 500m        | 1         | 512Mi          | 1Gi          | 3            | 15           |
| order-service    | 500m        | 1         | 512Mi          | 1Gi          | 3            | 12           |
| payment-service  | 250m        | 500m      | 256Mi          | 512Mi        | 2            | 8            |
| api-gateway      | 1           | 2         | 1Gi            | 2Gi          | 3            | 20           |
| web-store        | 200m        | 500m      | 256Mi          | 512Mi        | 2            | 10           |
| admin-panel      | 100m        | 250m      | 128Mi          | 256Mi        | 1            | 3            |

For auto-scaling policies and load testing details, see [scaling.md](scaling.md).

## Pod Disruption Budgets

Critical services maintain PDBs to ensure availability during node drains and
cluster upgrades:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: catalog-service-pdb
  namespace: backend
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: catalog-service
```

## Secrets Integration

Kubernetes secrets are synced from AWS Secrets Manager using the External Secrets
Operator. See [secrets-management.md](secrets-management.md) for the full secrets
workflow.

## Cluster Maintenance

Node group AMI updates are managed through Terraform. Cluster version upgrades
follow a blue-green node group strategy:

1. Create a new node group with the target Kubernetes version.
2. Cordon and drain the old node group.
3. Verify all pods are healthy on new nodes.
4. Remove the old node group via Terraform.

Upgrades are performed during the maintenance window (Monday 04:00-05:00 UTC)
and announced 48 hours in advance in `#shopflow-infra`.
