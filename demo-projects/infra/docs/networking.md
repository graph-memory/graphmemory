# Networking and VPC Architecture

## Overview

ShopFlow's network architecture is built on a multi-AZ VPC with strict subnet
isolation, layered security groups, and an Istio service mesh for intra-cluster
communication. This document covers the VPC layout, subnet design, security group
rules, NAT configuration, VPN access, and Istio routing policies.

## VPC Layout (Production)

```
VPC: 10.2.0.0/16 (shopflow-production)
├── us-east-1a
│   ├── Public Subnet:   10.2.1.0/24  (ALB, NAT Gateway, Bastion)
│   ├── Private Subnet:  10.2.10.0/24 (EKS worker nodes)
│   └── Database Subnet: 10.2.20.0/24 (RDS, ElastiCache)
├── us-east-1b
│   ├── Public Subnet:   10.2.2.0/24
│   ├── Private Subnet:  10.2.11.0/24
│   └── Database Subnet: 10.2.21.0/24
└── us-east-1c
    ├── Public Subnet:   10.2.3.0/24
    ├── Private Subnet:  10.2.12.0/24
    └── Database Subnet: 10.2.22.0/24
```

## Subnet Design

| Subnet Type | CIDR Range       | Route Table         | NAT | Internet | Purpose                    |
|------------|------------------|---------------------|-----|----------|----------------------------|
| Public     | 10.2.1.0/24-3.0  | public-rt           | N/A | IGW      | Load balancers, NAT GW     |
| Private    | 10.2.10.0/24-12.0| private-rt          | Yes | Via NAT  | EKS nodes, application pods|
| Database   | 10.2.20.0/24-22.0| database-rt (local) | No  | None     | RDS, ElastiCache           |

The Terraform VPC module creates all subnets. See [terraform.md](terraform.md)
for the module configuration.

## NAT Gateway

Production uses one NAT Gateway per AZ for high availability. Dev uses a single
NAT Gateway to reduce costs.

```hcl
# From terraform/modules/vpc/main.tf
resource "aws_nat_gateway" "main" {
  count = var.single_nat_gateway ? 1 : length(var.azs)

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name = "${var.name}-nat-${var.azs[count.index]}"
  })
}
```

| Environment | NAT Gateways | Monthly Cost | Rationale              |
|------------|-------------|-------------|------------------------|
| Dev         | 1            | ~$45        | Cost savings, single AZ sufficient |
| Staging     | 1            | ~$45        | Cost savings            |
| Production  | 3            | ~$135       | HA — one per AZ         |

## Security Groups

### Application Load Balancer

```hcl
resource "aws_security_group" "alb" {
  name_prefix = "shopflow-alb-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### EKS Worker Nodes

```hcl
resource "aws_security_group" "eks_nodes" {
  name_prefix = "shopflow-eks-nodes-"
  vpc_id      = module.vpc.vpc_id

  # Node-to-node communication
  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  # ALB to nodes (application traffic)
  ingress {
    from_port       = 1024
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # EKS control plane to nodes
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_cluster.id]
  }

  ingress {
    from_port       = 10250
    to_port         = 10250
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_cluster.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### Database Security Group

```hcl
resource "aws_security_group" "database" {
  name_prefix = "shopflow-db-"
  vpc_id      = module.vpc.vpc_id

  # PostgreSQL from EKS nodes only
  ingress {
    description     = "PostgreSQL from EKS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  # Redis from EKS nodes only
  ingress {
    description     = "Redis from EKS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  # No egress needed for databases
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }
}
```

### Security Group Summary

| Security Group   | Inbound From              | Ports           | Outbound To       |
|-----------------|---------------------------|-----------------|-------------------|
| ALB              | Internet (0.0.0.0/0)     | 80, 443         | EKS nodes         |
| EKS Nodes        | ALB, EKS control plane, self | 443, 1024-65535, 10250 | Internet (via NAT)|
| Database         | EKS nodes only            | 5432, 6379      | VPC only          |
| Bastion          | VPN CIDR only             | 22              | VPC only          |

## VPN Access

Engineers access the private network via AWS Client VPN:

```hcl
resource "aws_ec2_client_vpn_endpoint" "main" {
  description            = "ShopFlow Engineer VPN"
  server_certificate_arn = aws_acm_certificate.vpn.arn
  client_cidr_block      = "172.16.0.0/22"

  authentication_options {
    type                       = "federated-authentication"
    saml_provider_arn          = aws_iam_saml_provider.okta.arn
  }

  connection_log_options {
    enabled               = true
    cloudwatch_log_group  = aws_cloudwatch_log_group.vpn.name
    cloudwatch_log_stream = aws_cloudwatch_log_stream.vpn.name
  }

  split_tunnel = true
  dns_servers  = ["10.2.0.2"]

  tags = { Name = "shopflow-vpn" }
}
```

VPN is required for:
- Direct access to RDS (for DBA maintenance)
- Kubernetes API server (private endpoint)
- Internal dashboards (Grafana, Jaeger)

## VPC Endpoints

To reduce NAT Gateway costs and improve security, the following VPC endpoints
are configured:

| Service    | Endpoint Type | Purpose                                    |
|------------|--------------|---------------------------------------------|
| S3         | Gateway      | ECR image layers, backup storage, logs      |
| ECR API    | Interface    | Container image pulls                       |
| ECR DKR    | Interface    | Container image pulls (Docker protocol)     |
| STS        | Interface    | IAM role assumption (IRSA)                  |
| CloudWatch | Interface    | Metrics and logs shipping                   |
| Secrets Manager | Interface | Secret retrieval for External Secrets Operator |

```hcl
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = module.vpc.vpc_id
  service_name = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids

  tags = { Name = "shopflow-s3-endpoint" }
}
```

## Istio Service Mesh Routing

Istio manages all east-west traffic within the cluster. Key routing configurations:

### Destination Rules

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: catalog-service
  namespace: backend
spec:
  host: catalog-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: UPGRADE
        maxRequestsPerConnection: 1000
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 60s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST
  subsets:
    - name: stable
      labels:
        version: v1
    - name: canary
      labels:
        version: v2
```

### Network Policies

Kubernetes NetworkPolicy restricts pod-to-pod communication:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-default-deny
  namespace: backend
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: backend
        - namespaceSelector:
            matchLabels:
              name: istio-system
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: backend
    - to:
        - ipBlock:
            cidr: 10.2.20.0/22
      ports:
        - port: 5432
        - port: 6379
    - to:  # DNS
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
```

### Traffic Flow Summary

```
Internet → CloudFront → ALB (public subnet)
                           ↓
                    Istio IngressGateway (private subnet)
                           ↓
                    Envoy Sidecar → Application Pod
                           ↓ (mTLS)
                    Envoy Sidecar → Downstream Service
                           ↓
                    Database Subnet (RDS / ElastiCache)
```

## DNS Configuration

Route 53 manages all external DNS records:

| Record                    | Type  | Target                         | TTL  |
|--------------------------|-------|--------------------------------|------|
| shopflow.io              | A     | CloudFront distribution        | 300  |
| api.shopflow.io          | A     | ALB (alias)                    | 60   |
| staging.shopflow.io      | A     | Staging ALB (alias)            | 60   |
| grafana.shopflow.io      | CNAME | Internal ALB (VPN-only)        | 300  |

Internal DNS uses CoreDNS within the EKS cluster. Service discovery follows the
standard Kubernetes pattern: `<service>.<namespace>.svc.cluster.local`.

For security group changes and VPC modifications, all changes must go through
Terraform. See [terraform.md](terraform.md) for the infrastructure-as-code workflow
and [ci-cd.md](ci-cd.md) for the plan/apply pipeline.
