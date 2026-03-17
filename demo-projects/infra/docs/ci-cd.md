# CI/CD Pipelines

## Overview

ShopFlow uses GitHub Actions for all CI/CD workflows. The pipeline covers linting,
testing, container image building, infrastructure planning, and deployment across
three environments. All workflows are defined in `.github/workflows/` and follow
a trunk-based development model with environment promotion.

## Branch Strategy

```
main (production-ready)
  ├── feature/SHOP-123-add-wishlist
  ├── feature/SHOP-456-payment-refund
  └── hotfix/SHOP-789-cart-crash
```

| Branch Pattern   | Trigger          | Actions                               |
|-----------------|------------------|---------------------------------------|
| `feature/*`      | Push, PR         | Lint, test, build image (dev tag)     |
| `main`           | Merge            | Lint, test, build, deploy to staging  |
| `release/v*`     | Tag push         | Build, deploy to production           |
| `hotfix/*`       | Push, PR         | Lint, test, build (fast-track)        |

## Environments

| Environment | Trigger                    | Approval      | URL                          |
|-------------|----------------------------|---------------|------------------------------|
| Development | Push to `feature/*`        | None          | dev.shopflow.io              |
| Staging     | Merge to `main`            | None          | staging.shopflow.io          |
| Production  | Tag `release/v*.*.*`       | Manual (2 reviewers) | shopflow.io           |

## Core Workflow: Application CI

```yaml
name: Application CI
on:
  push:
    branches: [main, "feature/**", "hotfix/**"]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  ECR_REGISTRY: 333333333333.dkr.ecr.us-east-1.amazonaws.com
  NODE_VERSION: "20"

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: shopflow_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/shopflow_test
          REDIS_URL: redis://localhost:6379
      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push'
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::333333333333:role/github-actions-ecr
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push image
        run: |
          IMAGE_TAG=${{ github.sha }}
          docker build -t $ECR_REGISTRY/shopflow/${{ matrix.service }}:$IMAGE_TAG .
          docker push $ECR_REGISTRY/shopflow/${{ matrix.service }}:$IMAGE_TAG
    strategy:
      matrix:
        service: [catalog-service, order-service, payment-service, api-gateway, web-store, admin-panel]
```

## Deployment Workflow

```yaml
name: Deploy
on:
  workflow_run:
    workflows: ["Application CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::222222222222:role/github-actions-deploy
          aws-region: us-east-1
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name shopflow-stg --region us-east-1
      - name: Deploy services
        run: |
          IMAGE_TAG=${{ github.event.workflow_run.head_sha }}
          for service in catalog-service order-service payment-service api-gateway web-store admin-panel; do
            kubectl set image deployment/$service \
              $service=$ECR_REGISTRY/shopflow/$service:$IMAGE_TAG \
              -n backend --record
          done
      - name: Wait for rollout
        run: |
          for service in catalog-service order-service payment-service api-gateway; do
            kubectl rollout status deployment/$service -n backend --timeout=300s
          done
      - name: Run smoke tests
        run: |
          npm run test:smoke -- --base-url=https://staging.shopflow.io
```

## Terraform Plan/Apply Workflow

Infrastructure changes require a separate workflow with plan review:

```yaml
name: Terraform
on:
  push:
    paths: ["terraform/**"]
  pull_request:
    paths: ["terraform/**"]

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.7.0
      - name: Terraform Init
        run: terraform init
        working-directory: terraform/environments/production
      - name: Terraform Plan
        run: terraform plan -out=plan.tfplan -no-color
        working-directory: terraform/environments/production
      - name: Comment PR with plan
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const plan = require('fs').readFileSync('terraform/environments/production/plan.tfplan.txt');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `## Terraform Plan\n\`\`\`\n${plan}\n\`\`\``
            });

  apply:
    needs: plan
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production-infra
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init && terraform apply -auto-approve
        working-directory: terraform/environments/production
```

## Rollback Procedures

### Automatic Rollback

Deployments include a health check step. If the smoke tests fail, the workflow
triggers an automatic rollback:

```bash
# Rollback to previous revision
kubectl rollout undo deployment/catalog-service -n backend

# Check rollback status
kubectl rollout status deployment/catalog-service -n backend
```

### Manual Rollback

For manual rollback, identify the target revision and deploy:

```bash
# View rollout history
kubectl rollout history deployment/catalog-service -n backend

# Rollback to specific revision
kubectl rollout undo deployment/catalog-service -n backend --to-revision=42

# Or deploy a known-good image tag
kubectl set image deployment/catalog-service \
  catalog-service=$ECR_REGISTRY/shopflow/catalog-service:abc1234 \
  -n backend
```

### Database Rollback

Database migrations are forward-only. If a migration causes issues, deploy a
corrective migration. See [runbooks/database-recovery.md](runbooks/database-recovery.md)
for point-in-time recovery options.

## Security Scanning

Every PR triggers container image scanning and dependency auditing:

```yaml
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          severity: CRITICAL,HIGH
          exit-code: 1
      - name: npm audit
        run: npm audit --production --audit-level=high
```

## Pipeline Metrics

The team tracks the following CI/CD health metrics in Grafana
(see [monitoring.md](monitoring.md)):

| Metric                    | Target     | Current   |
|--------------------------|------------|-----------|
| Build success rate        | > 95%      | 97.3%     |
| Mean time to deploy       | < 15 min   | 11 min    |
| Deployment frequency      | Daily      | 3.2/day   |
| Change failure rate       | < 5%       | 2.1%      |
| Mean time to recovery     | < 30 min   | 18 min    |
