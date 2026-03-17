# Scaling and Capacity Planning

## Overview

ShopFlow is designed to handle seasonal traffic spikes typical of e-commerce
platforms (Black Friday, holiday sales, flash sales). This document covers
auto-scaling policies, load testing methodology, bottleneck analysis, capacity
planning, and cost optimization strategies.

## Auto-Scaling Policies

### Kubernetes HPA (Horizontal Pod Autoscaler)

Each service has an HPA configured with both resource-based and custom metric
targets. See [kubernetes.md](kubernetes.md) for the full HPA manifests.

| Service          | Scale Metric             | Target     | Min | Max | Cooldown Up | Cooldown Down |
|-----------------|--------------------------|------------|-----|-----|-------------|---------------|
| api-gateway      | CPU utilization          | 60%        | 3   | 20  | 60s         | 300s          |
| catalog-service  | CPU + requests/sec       | 70% / 1000 | 3   | 15  | 60s         | 300s          |
| order-service    | CPU utilization          | 70%        | 3   | 12  | 60s         | 300s          |
| payment-service  | CPU utilization          | 50%        | 2   | 8   | 60s         | 600s          |
| web-store        | CPU utilization          | 70%        | 2   | 10  | 30s         | 120s          |
| admin-panel      | CPU utilization          | 80%        | 1   | 3   | 120s        | 600s          |

### EKS Cluster Autoscaler

The Cluster Autoscaler adds/removes EC2 nodes based on pending pods:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  template:
    spec:
      containers:
        - name: cluster-autoscaler
          image: registry.k8s.io/autoscaling/cluster-autoscaler:v1.29.0
          command:
            - ./cluster-autoscaler
            - --v=4
            - --stderrthreshold=info
            - --cloud-provider=aws
            - --skip-nodes-with-local-storage=false
            - --expander=least-waste
            - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/shopflow-prod
            - --balance-similar-node-groups
            - --scale-down-delay-after-add=10m
            - --scale-down-unneeded-time=10m
            - --scale-down-utilization-threshold=0.5
```

Node group scaling boundaries (defined in Terraform, see [terraform.md](terraform.md)):

| Node Group    | Instance Type  | Min | Max | Current (prod) |
|--------------|----------------|-----|-----|----------------|
| application   | m6i.xlarge     | 3   | 12  | 6              |
| system        | t3.large       | 1   | 3   | 2              |

### RDS Auto-Scaling (Storage)

RDS storage auto-scales using the `max_allocated_storage` parameter:

| Environment | Allocated | Max Allocated | Current Usage |
|------------|-----------|---------------|---------------|
| Production  | 500 GB    | 2,000 GB      | 312 GB (62%)  |
| Staging     | 100 GB    | 200 GB        | 45 GB (45%)   |
| Dev         | 100 GB    | 200 GB        | 23 GB (23%)   |

Read replicas can be added for read-heavy traffic patterns:

```bash
# Create a read replica (via Terraform preferred, but for emergencies)
aws rds create-db-instance-read-replica \
  --db-instance-identifier shopflow-prod-read-1 \
  --source-db-instance-identifier shopflow-production \
  --db-instance-class db.r6g.large \
  --region us-east-1
```

## Load Testing Results

Load tests are conducted monthly using k6 against the staging environment. The
staging cluster mirrors production configuration but with smaller instance sizes.

### Baseline Performance (Normal Traffic)

| Endpoint              | Method | Concurrent Users | RPS   | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate |
|-----------------------|--------|------------------|-------|-----------|-----------|-----------|------------|
| GET /catalog/products | GET    | 100              | 2,400 | 12        | 45        | 120       | 0.00%      |
| GET /catalog/products/:id | GET | 100             | 3,100 | 8         | 25        | 65        | 0.00%      |
| POST /orders          | POST   | 50               | 450   | 85        | 210       | 480       | 0.01%      |
| POST /payments/charge | POST   | 30               | 180   | 320       | 850       | 1,400     | 0.02%      |
| GET /search           | GET    | 100              | 1,800 | 35        | 120       | 350       | 0.00%      |

### Peak Traffic Simulation (Black Friday)

Simulating 10x normal traffic (target: 25,000 concurrent users):

| Endpoint              | Concurrent Users | RPS    | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate |
|-----------------------|------------------|--------|-----------|-----------|-----------|------------|
| GET /catalog/products | 1,000            | 18,500 | 25        | 95        | 280       | 0.01%      |
| GET /catalog/products/:id | 1,000        | 24,200 | 15        | 55        | 150       | 0.00%      |
| POST /orders          | 500              | 2,800  | 180       | 520       | 1,200     | 0.15%      |
| POST /payments/charge | 300              | 1,100  | 650       | 2,100     | 4,500     | 0.45%      |
| GET /search           | 1,000            | 12,000 | 85        | 350       | 900       | 0.03%      |

### k6 Test Script (Example)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // ramp up
    { duration: '5m', target: 1000 },  // peak
    { duration: '2m', target: 100 },   // ramp down
    { duration: '1m', target: 0 },     // cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const catalogRes = http.get('https://staging.shopflow.io/catalog/products?page=1&limit=20');
  check(catalogRes, {
    'catalog status 200': (r) => r.status === 200,
    'catalog latency < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(Math.random() * 2);

  const productId = Math.floor(Math.random() * 10000) + 1;
  const detailRes = http.get(`https://staging.shopflow.io/catalog/products/${productId}`);
  check(detailRes, {
    'detail status 200': (r) => r.status === 200,
  });

  sleep(Math.random() * 3);
}
```

## Bottleneck Analysis

Based on load testing results and production monitoring, the following bottlenecks
have been identified and addressed:

| Bottleneck                    | Impact                          | Status     | Mitigation                              |
|------------------------------|----------------------------------|------------|----------------------------------------|
| Database connection pooling   | Order creation P99 > 2s at peak | Resolved   | PgBouncer sidecar, pool size 50→200    |
| Redis single-threaded ops     | Cache latency spikes at 15k RPS | Resolved   | Migrated to Redis Cluster (3 shards)   |
| Payment provider rate limit   | 429 errors at >500 TPS          | Mitigated  | Queue + retry with exponential backoff |
| Search index size             | Full-text search >1s at scale   | Monitoring | Elasticsearch dedicated nodes planned  |
| Image processing              | Product upload timeout at load   | Resolved   | Offloaded to Lambda + SQS async pipeline|
| DNS resolution in pods        | Intermittent 5s delays           | Resolved   | ndots:2 in resolv.conf, NodeLocal DNS  |

## Capacity Planning

### Current vs Projected Resource Usage (Production)

| Resource        | Current Usage | 3-Month Projection | 6-Month Projection | Threshold |
|----------------|---------------|--------------------|--------------------|-----------|
| EKS nodes       | 6 / 12        | 8 / 12             | 10 / 12            | 80%       |
| RDS storage     | 312 GB / 2 TB | 420 GB / 2 TB      | 550 GB / 2 TB      | 75%       |
| RDS CPU         | 35% avg       | 45% avg            | 55% avg            | 70%       |
| RDS connections | 120 / 500     | 180 / 500          | 250 / 500          | 80%       |
| Redis memory    | 4.2 GB / 13 GB| 5.8 GB / 13 GB     | 7.5 GB / 13 GB     | 75%       |
| S3 storage      | 1.2 TB        | 1.8 TB             | 2.5 TB             | N/A       |

### Scaling Recommendations

1. **EKS**: Increase `max_size` from 12 to 18 before Q4 holiday season.
2. **RDS**: Plan upgrade to `r6g.2xlarge` when CPU consistently exceeds 60%.
3. **Redis**: Evaluate adding a 4th shard when memory exceeds 10 GB.
4. **CDN**: Pre-warm CloudFront cache before major sales events.

## Cost Optimization

### Current Monthly Costs (Production)

| Service         | Monthly Cost | % of Total | Optimization Opportunity |
|----------------|-------------|------------|--------------------------|
| EKS (EC2)       | $4,200      | 38%        | Spot instances for stateless workloads |
| RDS             | $2,800      | 25%        | Reserved Instances (1-year) |
| ElastiCache     | $980        | 9%         | Reserved Nodes (1-year)   |
| S3 + Transfer   | $850        | 8%         | Lifecycle policies, IA tier|
| CloudFront      | $620        | 6%         | Cache optimization         |
| NAT Gateway     | $540        | 5%         | VPC endpoints for S3/ECR   |
| Other           | $1,010      | 9%         | Various                    |
| **Total**       | **$11,000** | **100%**   |                            |

### Savings Initiatives

| Initiative                           | Estimated Savings | Status       |
|-------------------------------------|-------------------|--------------|
| EC2 Spot Instances (stateless pods)  | $1,200/mo (29%)   | In progress  |
| RDS Reserved Instance (1-year)       | $840/mo (30%)     | Approved     |
| S3 Intelligent-Tiering               | $170/mo (20%)     | Implemented  |
| VPC Endpoints (S3, ECR, STS)         | $320/mo (59%)     | Planned Q2   |
| Right-size dev/staging instances     | $600/mo           | Planned Q2   |

For monitoring costs and alert thresholds, see [monitoring.md](monitoring.md).
For the underlying infrastructure definitions, see [terraform.md](terraform.md).
