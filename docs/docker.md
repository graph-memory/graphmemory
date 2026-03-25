# Docker

## Image

| Field | Value |
|-------|-------|
| **Registry** | `ghcr.io/graph-memory/graphmemory-server` |
| **Platforms** | `linux/amd64`, `linux/arm64` |
| **Base image** | `node:24-slim` |

## Quick start

### Docker run

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```

### Docker Compose

```yaml
services:
  graph-memory:
    image: ghcr.io/graph-memory/graphmemory-server
    ports:
      - "3000:3000"
    volumes:
      - ./graph-memory.yaml:/data/config/graph-memory.yaml:ro
      - /path/to/my-app:/data/projects/my-app
      - models:/data/models
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  models:
  redis-data:
```

> Redis is optional. Remove the `redis` service and `depends_on` if you don't need shared session store or embedding cache. See [configuration.md](configuration.md#redis) for the `server.redis` settings.

```bash
docker compose up -d
```

## Volume mounts

| Mount | Container path | Description |
|-------|---------------|-------------|
| **Config** | `/data/config/graph-memory.yaml` | YAML config file (read-only) |
| **Projects** | `/data/projects/` | Project directories to index |
| **Models** | `/data/models/` | Embedding model cache (named volume recommended) |

### Project directory access

- Mount as **read-only** (`:ro`) if you only use docs/code/files indexing
- Remove `:ro` if you use knowledge/tasks/skills (mirror files need write access)

### Model cache

The default embedding model (`Xenova/bge-m3`, ~560 MB) downloads on first startup. Use a **named volume** so the model persists across container restarts.

## Config for Docker

Paths in `graph-memory.yaml` must be relative to the container filesystem:

```yaml
server:
  host: "0.0.0.0"              # Bind to all interfaces (required in Docker)
  port: 3000
  modelsDir: "/data/models"     # Match the volume mount
  redis:
    enabled: true
    url: "redis://redis:6379"   # Service name from docker-compose

projects:
  my-app:
    projectDir: "/data/projects/my-app"    # Match the volume mount
```

## Commands

### Default (serve)

```bash
docker run ghcr.io/graph-memory/graphmemory-server
# Equivalent to: node dist/cli/index.js serve --config /data/config/graph-memory.yaml
```

### Force re-index

```bash
docker run --rm \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server serve --config /data/config/graph-memory.yaml --reindex
```

### Index once and exit

```bash
# Docker
docker run --rm \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server index --config /data/config/graph-memory.yaml

# Docker Compose
docker compose run --rm graph-memory index --config /data/config/graph-memory.yaml
```

## Endpoints

| Path | Description |
|------|-------------|
| `http://localhost:3000` | Web UI |
| `http://localhost:3000/mcp/my-app` | MCP HTTP endpoint |
| `http://localhost:3000/api/projects` | REST API |

## Dockerfile

Multi-stage build:

```dockerfile
# Build stage
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY ui/ ./ui/
RUN npm run build

# Runtime stage
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/ui/dist ./ui/dist
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["serve", "--config", "/data/config/graph-memory.yaml"]
```

## CI/CD

### Docker image build

GitHub Actions workflow (`.github/workflows/docker.yml`):

- **Trigger**: push tags `v*` or manual dispatch
- **Platforms**: `linux/amd64`, `linux/arm64` (via QEMU + Buildx)
- **Registry**: `ghcr.io/graph-memory/graphmemory-server`
- **Tags**: `latest`, git SHA, semver (`1.0.4`, `1.0`, `1`)

### Building locally

```bash
docker build -t graphmemory-server .
docker run -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  graphmemory
```

## Multiple projects

Mount each project directory separately:

```yaml
services:
  graph-memory:
    image: ghcr.io/graph-memory/graphmemory-server
    ports:
      - "3000:3000"
    volumes:
      - ./graph-memory.yaml:/data/config/graph-memory.yaml:ro
      - /path/to/app1:/data/projects/app1
      - /path/to/app2:/data/projects/app2
      - models:/data/models
    depends_on:
      redis:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  models:
  redis-data:
```

Restart the container to apply config changes.
