# ShopFlow Infrastructure Overview

## Introduction

ShopFlow is a cloud-native e-commerce platform deployed on AWS. The infrastructure
is designed for high availability, horizontal scalability, and operational
resilience. All infrastructure is provisioned as code using Terraform, orchestrated
on Kubernetes (EKS), and monitored through a comprehensive observability stack.

This document serves as the entry point for understanding the overall architecture,
the cloud provider strategy, and how each infrastructure component connects.

## Architecture Diagram

```
                        ┌─────────────────────┐
                        │    Route 53 (DNS)    │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐
                        │  CloudFront (CDN)    │
                        │  - Static assets     │
                        │  - API caching        │
                        └──────────┬──────────┘
                                   │
                   ┌───────────────▼───────────────┐
                   │     Application Load Balancer   │
                   │     (ALB Ingress Controller)    │
                   └───────────────┬───────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │            EKS Cluster (v1.29)           │
              │                                          │
              │  ┌──────────┐ ┌──────────┐ ┌──────────┐│
              │  │ backend  │ │ frontend │ │monitoring││
              │  │namespace │ │namespace │ │namespace ││
              │  │          │ │          │ │          ││
              │  │ catalog  │ │ web-store│ │Prometheus││
              │  │ order    │ │ admin    │ │ Grafana  ││
              │  │ api-gw   │ │ panel    │ │ Loki     ││
              │  │ payment  │ │          │ │ Jaeger   ││
              │  └────┬─────┘ └──────────┘ └──────────┘│
              └───────┼────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼────┐ ┌─────▼────┐ ┌────▼─────┐
    │  RDS    │ │ElastiCache│ │   S3     │
    │PostgreSQL│ │  Redis   │ │ Buckets  │
    │ Multi-AZ│ │ Cluster  │ │          │
    └─────────┘ └──────────┘ └──────────┘
```

## Cloud Provider: AWS

All infrastructure runs on AWS in the `us-east-1` region with disaster recovery
provisions in `us-west-2`. The following AWS services are used:

| Service         | Purpose                          | Configuration         |
|-----------------|----------------------------------|-----------------------|
| EKS             | Container orchestration          | v1.29, managed nodes  |
| RDS PostgreSQL  | Primary relational database      | Multi-AZ, r6g.xlarge  |
| ElastiCache     | Session store + caching layer    | Redis 7.x cluster     |
| S3              | Static assets, backups, logs     | Versioned, encrypted  |
| CloudFront      | CDN for static assets and API    | Global edge locations |
| Route 53        | DNS management                   | Health-checked routing|
| Secrets Manager | Credentials and API keys         | Auto-rotation enabled |
| ECR             | Container image registry         | Immutable tags        |
| CloudWatch      | Log aggregation, basic alarms    | 30-day retention      |

## Service Mesh: Istio

ShopFlow uses Istio 1.20 as its service mesh layer within the EKS cluster. Istio
provides:

- **Mutual TLS (mTLS)**: All inter-service communication is encrypted by default.
- **Traffic management**: Canary deployments, circuit breaking, and retry policies.
- **Observability**: Distributed tracing via Jaeger integration.
- **Rate limiting**: Per-service rate limits enforced at the sidecar proxy level.

Istio configuration is managed declaratively via Kubernetes CRDs:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: catalog-service
  namespace: backend
spec:
  hosts:
    - catalog-service
  http:
    - route:
        - destination:
            host: catalog-service
            subset: stable
          weight: 90
        - destination:
            host: catalog-service
            subset: canary
          weight: 10
      retries:
        attempts: 3
        perTryTimeout: 2s
```

## Environments

ShopFlow maintains three environments, each isolated at the AWS account level:

| Environment | AWS Account     | Cluster        | Purpose                    |
|-------------|-----------------|----------------|----------------------------|
| Development | 111111111111    | shopflow-dev   | Feature development, testing|
| Staging     | 222222222222    | shopflow-stg   | Pre-production validation  |
| Production  | 333333333333    | shopflow-prod  | Live customer traffic      |

All environments share the same Terraform modules but use separate workspaces
and variable files. See [terraform.md](terraform.md) for module structure.

## Key Design Principles

1. **Infrastructure as Code**: Every resource is defined in Terraform. Manual
   changes to AWS resources are prohibited and detected by drift detection.
2. **Immutable deployments**: Container images are tagged with commit SHAs.
   No in-place updates; every deployment creates new pods.
3. **Least privilege**: IAM roles scoped per service using IRSA (IAM Roles for
   Service Accounts). See [secrets-management.md](secrets-management.md).
4. **Defense in depth**: Network segmentation via VPC subnets, security groups,
   and Istio network policies. See [networking.md](networking.md).
5. **Observable by default**: Every service emits metrics, logs, and traces.
   See [monitoring.md](monitoring.md) for the full observability stack.

## Repository Structure

```
infra/
  docs/
    README.md                      # This file
    terraform.md                   # Terraform modules and state management
    kubernetes.md                  # K8s cluster configuration
    ci-cd.md                       # CI/CD pipelines
    monitoring.md                  # Observability stack
    scaling.md                     # Auto-scaling and capacity planning
    networking.md                  # VPC and network topology
    secrets-management.md          # Secrets and credential management
    runbooks/
      incident-response.md        # Incident handling procedures
      database-recovery.md        # Database backup and recovery
```

## Quick Links

- Deployment pipeline: [ci-cd.md](ci-cd.md)
- Cluster setup: [kubernetes.md](kubernetes.md)
- Incident handling: [runbooks/incident-response.md](runbooks/incident-response.md)
- Database recovery: [runbooks/database-recovery.md](runbooks/database-recovery.md)
- Scaling strategy: [scaling.md](scaling.md)
- Network topology: [networking.md](networking.md)
- Monitoring setup: [monitoring.md](monitoring.md)

## Contacts

| Role                  | Team               | Slack Channel       |
|-----------------------|--------------------|---------------------|
| Infrastructure Lead   | Platform Eng       | #shopflow-infra     |
| On-call Engineer      | SRE                | #shopflow-oncall    |
| Security Contact      | InfoSec            | #shopflow-security  |
| Database Admin        | Data Platform      | #shopflow-data      |

For emergency escalation procedures, see [runbooks/incident-response.md](runbooks/incident-response.md).
