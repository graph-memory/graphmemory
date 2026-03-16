# Deployment Guide

## Docker

### Building the Image

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=taskflow
      - DB_USER=taskflow
      - DB_PASSWORD=secret
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=taskflow
      - POSTGRES_USER=taskflow
      - POSTGRES_PASSWORD=secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

## Cloud Providers

### AWS (ECS + Fargate)

1. Push image to ECR
2. Create ECS task definition
3. Set up ALB with health check on `/health`
4. Configure RDS PostgreSQL and ElastiCache Redis
5. Use Secrets Manager for sensitive env vars

### Google Cloud (Cloud Run)

```bash
gcloud run deploy taskflow-api \
  --image gcr.io/myproject/taskflow-api \
  --port 3000 \
  --set-env-vars DB_HOST=... \
  --set-secrets JWT_SECRET=jwt-secret:latest \
  --min-instances 1 \
  --max-instances 10
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: taskflow-api
  template:
    metadata:
      labels:
        app: taskflow-api
    spec:
      containers:
        - name: api
          image: taskflow-api:latest
          ports:
            - containerPort: 3000
          env:
            - name: DB_HOST
              valueFrom:
                configMapKeyRef:
                  name: taskflow-config
                  key: db-host
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: taskflow-secrets
                  key: jwt-secret
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Bind address |
| `DB_PORT` | 5432 | Database port |
| `DB_SSL` | false | Enable SSL |
| `DB_POOL_MIN` | 2 | Min pool connections |
| `DB_POOL_MAX` | 10 | Max pool connections |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `LOG_LEVEL` | info | Logging level |
| `CORS_ORIGINS` | * | Allowed CORS origins |

## Health Checks

```http
GET /health
```

Returns `200 OK` with:

```json
{
  "status": "healthy",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected"
}
```

## Monitoring

### Recommended Metrics

- Request rate and latency (p50, p95, p99)
- Error rate by status code
- Active connections
- Database pool usage
- Cache hit rate
- Task creation/completion rate

### Logging

Structured JSON logging in production:

```json
{
  "level": "info",
  "message": "POST /api/tasks 201",
  "context": "HTTP",
  "timestamp": "2024-03-20T10:30:00.000Z",
  "data": {
    "method": "POST",
    "path": "/api/tasks",
    "statusCode": 201,
    "durationMs": 45
  }
}
```

## Database Migrations

Run pending migrations:

```bash
npm run migrate
```

Rollback last migration:

```bash
npm run migrate:rollback
```

Create a new migration:

```bash
npm run migrate:create -- add-task-labels
```
