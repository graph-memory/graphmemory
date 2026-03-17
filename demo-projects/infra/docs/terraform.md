# Terraform Infrastructure

## Overview

ShopFlow infrastructure is provisioned entirely through Terraform v1.7+. All modules
follow HashiCorp's standard module structure and are stored in the `terraform/`
directory of the infra repository. State is managed remotely in S3 with DynamoDB
locking.

## Module Structure

```
terraform/
  modules/
    vpc/              # VPC, subnets, NAT gateways, flow logs
    eks/              # EKS cluster, managed node groups, IRSA
    rds/              # RDS PostgreSQL instance, parameter groups, backups
    elasticache/      # Redis cluster, subnet groups, parameter groups
    s3/               # S3 buckets (assets, backups, logs)
    cloudfront/       # CloudFront distribution, origins, behaviors
    iam/              # IAM roles, policies, OIDC provider
    secrets/          # Secrets Manager resources, rotation lambdas
    monitoring/       # CloudWatch alarms, log groups, SNS topics
  environments/
    dev/
      main.tf         # Dev environment root module
      variables.tf    # Dev-specific variable values
      terraform.tfvars
    staging/
      main.tf
      variables.tf
      terraform.tfvars
    production/
      main.tf
      variables.tf
      terraform.tfvars
  backend.tf          # S3 backend configuration
  providers.tf        # AWS provider, version constraints
  versions.tf         # Required providers and Terraform version
```

## State Management

Remote state is stored in S3 with DynamoDB locking to prevent concurrent applies:

```hcl
terraform {
  backend "s3" {
    bucket         = "shopflow-terraform-state"
    key            = "infra/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "shopflow-terraform-locks"
    kms_key_id     = "alias/terraform-state-key"
  }
}
```

State files are separated per environment using Terraform workspaces:

```bash
# Switch to production workspace
terraform workspace select production

# List all workspaces
terraform workspace list
#   default
#   dev
# * staging
#   production
```

## VPC Module

The VPC module creates a multi-AZ network topology. See [networking.md](networking.md)
for the detailed network layout.

```hcl
module "vpc" {
  source = "./modules/vpc"

  name               = "shopflow-${var.environment}"
  cidr               = var.vpc_cidr
  azs                = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets    = var.private_subnet_cidrs
  public_subnets     = var.public_subnet_cidrs
  database_subnets   = var.database_subnet_cidrs

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment == "dev" ? true : false
  enable_dns_hostnames = true
  enable_flow_log      = true

  tags = local.common_tags
}
```

Environment-specific CIDR allocations:

| Environment | VPC CIDR       | Public Subnets          | Private Subnets         | Database Subnets        |
|-------------|----------------|-------------------------|-------------------------|-------------------------|
| Dev         | 10.0.0.0/16    | 10.0.1.0/24, 10.0.2.0/24 | 10.0.10.0/24, 10.0.11.0/24 | 10.0.20.0/24, 10.0.21.0/24 |
| Staging     | 10.1.0.0/16    | 10.1.1.0/24, 10.1.2.0/24 | 10.1.10.0/24, 10.1.11.0/24 | 10.1.20.0/24, 10.1.21.0/24 |
| Production  | 10.2.0.0/16    | 10.2.1.0/24 - 10.2.3.0/24 | 10.2.10.0/24 - 10.2.12.0/24 | 10.2.20.0/24 - 10.2.22.0/24 |

## EKS Module

The EKS module provisions a managed Kubernetes cluster with separate node groups
for application workloads and system components:

```hcl
module "eks" {
  source = "./modules/eks"

  cluster_name    = "shopflow-${var.environment}"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  managed_node_groups = {
    application = {
      instance_types = var.environment == "production" ? ["m6i.xlarge"] : ["m6i.large"]
      min_size       = var.environment == "production" ? 3 : 1
      max_size       = var.environment == "production" ? 12 : 4
      desired_size   = var.environment == "production" ? 6 : 2
      disk_size      = 100
      labels = {
        workload = "application"
      }
    }
    system = {
      instance_types = ["t3.large"]
      min_size       = 1
      max_size       = 3
      desired_size   = 2
      disk_size      = 50
      labels = {
        workload = "system"
      }
      taints = [{
        key    = "CriticalAddonsOnly"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  enable_irsa = true

  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
  }

  tags = local.common_tags
}
```

## RDS Module

PostgreSQL 16 on RDS with Multi-AZ deployment in production:

```hcl
module "rds" {
  source = "./modules/rds"

  identifier     = "shopflow-${var.environment}"
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = var.rds_instance_class
  multi_az       = var.environment == "production"

  allocated_storage     = var.environment == "production" ? 500 : 100
  max_allocated_storage = var.environment == "production" ? 2000 : 200
  storage_encrypted     = true

  db_name  = "shopflow"
  port     = 5432
  username = "shopflow_admin"

  vpc_security_group_ids = [module.vpc.database_security_group_id]
  db_subnet_group_name   = module.vpc.database_subnet_group_name

  backup_retention_period = var.environment == "production" ? 35 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  monitoring_interval          = 60

  deletion_protection = var.environment == "production"

  tags = local.common_tags
}
```

See [runbooks/database-recovery.md](runbooks/database-recovery.md) for backup and
restore procedures.

## ElastiCache Module

Redis 7.x cluster for session storage and application caching:

```hcl
module "elasticache" {
  source = "./modules/elasticache"

  cluster_id      = "shopflow-${var.environment}"
  engine          = "redis"
  engine_version  = "7.1"
  node_type       = var.environment == "production" ? "cache.r6g.large" : "cache.t3.medium"
  num_cache_nodes = var.environment == "production" ? 3 : 1

  subnet_group_name  = module.vpc.elasticache_subnet_group_name
  security_group_ids = [module.vpc.cache_security_group_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window          = "02:00-03:00"

  parameter_group_family = "redis7"
  parameters = {
    maxmemory-policy = "allkeys-lru"
    notify-keyspace-events = "Ex"
  }

  tags = local.common_tags
}
```

## S3 and CloudFront Modules

Three S3 buckets serve different purposes:

| Bucket                         | Purpose              | Versioning | Lifecycle       |
|-------------------------------|----------------------|------------|-----------------|
| shopflow-assets-{env}         | Product images, static| Enabled    | IA after 90 days|
| shopflow-backups-{env}        | DB dumps, exports    | Enabled    | Glacier after 30d|
| shopflow-logs-{env}           | Application logs     | Disabled   | Delete after 90d|

CloudFront sits in front of the assets bucket and the ALB for API caching.
See [networking.md](networking.md) for CDN routing configuration.

## Applying Changes

```bash
# Initialize modules
cd terraform/environments/production
terraform init

# Plan changes
terraform plan -out=plan.tfplan

# Apply with approval
terraform apply plan.tfplan

# Destroy (dev only, requires confirmation)
terraform destroy
```

All production applies must go through the CI/CD pipeline. See [ci-cd.md](ci-cd.md)
for the Terraform plan/apply workflow.

## Drift Detection

A scheduled GitHub Actions workflow runs `terraform plan` nightly against production
and posts any detected drift to the `#shopflow-infra` Slack channel. Manual changes
to AWS resources are prohibited by an SCP (Service Control Policy) that denies
console access to infrastructure resources.
