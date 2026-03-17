# Secrets Management

## Overview

ShopFlow follows a zero-trust approach to secrets management. No secrets are stored
in source code, environment files, or Kubernetes manifests. All sensitive credentials
are managed through AWS Secrets Manager with automatic rotation, synced to Kubernetes
via the External Secrets Operator, and injected into application pods at runtime.

## Architecture

```
AWS Secrets Manager
    │
    │  (sync every 60s)
    ▼
External Secrets Operator (ESO)
    │
    │  (creates/updates)
    ▼
Kubernetes Secret objects
    │
    │  (mounted as env vars / volumes)
    ▼
Application Pods
```

## AWS Secrets Manager

### Secret Organization

Secrets are organized with a consistent naming convention:

```
shopflow/{environment}/{service}/{secret-name}
```

| Secret Path                                    | Type        | Rotation | Used By            |
|-----------------------------------------------|-------------|----------|---------------------|
| shopflow/prod/catalog/database-url             | Connection  | 30 days  | catalog-service     |
| shopflow/prod/order/database-url               | Connection  | 30 days  | order-service       |
| shopflow/prod/shared/redis-url                 | Connection  | 90 days  | All backend services|
| shopflow/prod/payment/stripe-api-key           | API key     | 90 days  | payment-service     |
| shopflow/prod/payment/stripe-webhook-secret    | Webhook     | 90 days  | payment-service     |
| shopflow/prod/shared/jwt-signing-key           | Signing key | 180 days | api-gateway         |
| shopflow/prod/shared/session-secret            | Encryption  | 90 days  | api-gateway         |
| shopflow/prod/email/sendgrid-api-key           | API key     | 90 days  | order-service       |
| shopflow/prod/search/elasticsearch-credentials | Connection  | 90 days  | catalog-service     |
| shopflow/prod/monitoring/pagerduty-key         | API key     | Never    | alertmanager        |

### Creating Secrets

```bash
# Create a new secret
aws secretsmanager create-secret \
  --name "shopflow/prod/catalog/database-url" \
  --description "Catalog service PostgreSQL connection string" \
  --secret-string "postgresql://catalog_user:$(openssl rand -base64 32)@shopflow-production.abc123.us-east-1.rds.amazonaws.com:5432/shopflow?schema=catalog" \
  --tags Key=Environment,Value=production Key=Service,Value=catalog-service \
  --region us-east-1

# Update an existing secret
aws secretsmanager update-secret \
  --secret-id "shopflow/prod/catalog/database-url" \
  --secret-string "new-connection-string"

# List secrets for a service
aws secretsmanager list-secrets \
  --filter Key=name,Values=shopflow/prod/catalog \
  --query 'SecretList[*].{Name:Name,LastRotated:LastRotatedDate}'
```

### Terraform Definition

Secrets are declared in Terraform but values are never stored in state:

```hcl
resource "aws_secretsmanager_secret" "catalog_db" {
  name                    = "shopflow/${var.environment}/catalog/database-url"
  description             = "Catalog service database connection string"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.secrets.arn

  tags = merge(local.common_tags, {
    Service = "catalog-service"
    Type    = "database-connection"
  })
}

# Initial value is set manually or via a separate bootstrap script
# Never put secret values in Terraform code or tfvars files
```

## Rotation Policies

### Database Credential Rotation

Database credentials are rotated every 30 days using a Lambda rotation function:

```hcl
resource "aws_secretsmanager_secret_rotation" "catalog_db" {
  secret_id           = aws_secretsmanager_secret.catalog_db.id
  rotation_lambda_arn = aws_lambda_function.secret_rotation.arn

  rotation_rules {
    automatically_after_days = 30
    duration                 = "2h"
    schedule_expression      = "rate(30 days)"
  }
}
```

The rotation Lambda follows the multi-user rotation strategy:

1. **createSecret**: Generate new credentials, create new DB user.
2. **setSecret**: Set the password on the new DB user in RDS.
3. **testSecret**: Verify the new credentials can connect.
4. **finishSecret**: Mark the new version as `AWSCURRENT`, old as `AWSPREVIOUS`.

```python
# Lambda rotation handler (simplified)
def lambda_handler(event, context):
    step = event['Step']
    secret_id = event['SecretId']
    token = event['ClientRequestToken']

    if step == "createSecret":
        new_password = generate_secure_password()
        secrets_client.put_secret_value(
            SecretId=secret_id,
            ClientRequestToken=token,
            SecretString=json.dumps({
                "username": f"catalog_user_{token[:8]}",
                "password": new_password,
                "host": os.environ['DB_HOST'],
                "dbname": "shopflow"
            }),
            VersionStages=['AWSPENDING']
        )
    elif step == "setSecret":
        # Create new user in database with the pending credentials
        pending = get_secret_value(secret_id, 'AWSPENDING')
        create_db_user(pending['username'], pending['password'])
    elif step == "testSecret":
        # Verify connection works
        pending = get_secret_value(secret_id, 'AWSPENDING')
        test_connection(pending)
    elif step == "finishSecret":
        # Promote pending to current
        secrets_client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=token,
            RemoveFromVersionId=get_current_version(secret_id)
        )
```

### Rotation Schedule

| Secret Type          | Rotation Period | Strategy                    | Downtime |
|---------------------|----------------|-----------------------------|----------|
| Database credentials | 30 days        | Multi-user (dual credentials)| None     |
| Redis password       | 90 days        | Single-user (brief reconnect)| <5s      |
| API keys (Stripe)    | 90 days        | Manual (vendor portal)       | None     |
| JWT signing keys     | 180 days       | Dual-key (old key valid 24h) | None     |
| Session secrets      | 90 days        | Rolling (old sessions valid) | None     |

## External Secrets Operator

ESO syncs AWS Secrets Manager values into Kubernetes Secret objects.

### Installation

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace \
  --set installCRDs=true
```

### Cluster Secret Store

A ClusterSecretStore is configured with IRSA for AWS authentication:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
            namespace: external-secrets
```

### External Secret Definition

Each service declares its required secrets:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: catalog-service-secrets
  namespace: backend
spec:
  refreshInterval: 1m
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: catalog-db-credentials
    creationPolicy: Owner
    deletionPolicy: Retain
  data:
    - secretKey: connection-string
      remoteRef:
        key: shopflow/prod/catalog/database-url
    - secretKey: redis-url
      remoteRef:
        key: shopflow/prod/shared/redis-url
```

### Environment Variable Injection

Pods reference the synced Kubernetes secrets:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: catalog-db-credentials
        key: connection-string
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: catalog-db-credentials
        key: redis-url
```

See [kubernetes.md](kubernetes.md) for full deployment manifests with secret references.

## CI/CD Secrets

GitHub Actions workflows use OIDC federation to assume AWS IAM roles — no
long-lived credentials are stored in GitHub.

### OIDC Configuration

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name = "github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:shopflow/*:ref:refs/heads/main"
        }
      }
    }]
  })
}
```

### GitHub Actions Usage

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::333333333333:role/github-actions-deploy
    aws-region: us-east-1
    # No access keys needed — uses OIDC token exchange
```

See [ci-cd.md](ci-cd.md) for the full deployment workflow.

## Security Policies

1. **No secrets in code**: Pre-commit hooks scan for high-entropy strings and
   known secret patterns. `gitleaks` runs in CI on every PR.
2. **No secrets in logs**: Application logging libraries are configured to redact
   fields matching `password`, `secret`, `token`, `key`, `authorization`.
3. **Encryption at rest**: All secrets encrypted with a dedicated KMS key
   (`alias/shopflow-secrets-key`).
4. **Audit trail**: CloudTrail logs all `GetSecretValue` calls. Alerts fire on
   unusual access patterns (e.g., access from unexpected roles).
5. **Least privilege**: Each service's IRSA role can only access its own secrets
   path prefix (`shopflow/{env}/{service}/*`).

## Emergency Credential Rotation

If a credential is suspected compromised:

```bash
# 1. Immediately rotate the secret
aws secretsmanager rotate-secret \
  --secret-id "shopflow/prod/catalog/database-url" \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:333333333333:function:secret-rotation

# 2. Force ESO to sync immediately
kubectl annotate externalsecret catalog-service-secrets \
  force-sync=$(date +%s) -n backend --overwrite

# 3. Restart affected pods to pick up new credentials
kubectl rollout restart deployment/catalog-service -n backend

# 4. Verify the old credential no longer works
# 5. Open a SEV-2 incident for investigation
```

For incident handling during a credential compromise, see
[runbooks/incident-response.md](runbooks/incident-response.md).
