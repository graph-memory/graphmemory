---
slug: docker-deployment
title: "Deploying Graph Memory with Docker"
authors: [graphmemory]
tags: [tutorial, deployment, docker, production]
description: "A step-by-step guide to deploying Graph Memory with Docker and Docker Compose, including production configuration and Redis caching."
---

Graph Memory ships as a multi-platform Docker image (amd64 + arm64) on GitHub Container Registry. This post walks through a complete production deployment: Docker Compose setup, volume configuration, authentication, Redis caching, and health monitoring.

<!-- truncate -->

## Quick start

The fastest way to get running:

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```

Three volume mounts. The config file, your project directory, and a named volume for the embedding model cache. That's all you need.

## Docker Compose for production

Here's a complete `docker-compose.yml` with Redis for embedding cache:

```yaml
services:
  graphmemory:
    image: ghcr.io/graph-memory/graphmemory-server:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./graph-memory.yaml:/data/config/graph-memory.yaml:ro
      - /srv/projects/my-app:/data/projects/my-app
      - models:/data/models
    environment:
      - NODE_ENV=production
      - LOG_JSON=1
      - LOG_LEVEL=info
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

A few things to note:

- **Bind to localhost** (`127.0.0.1:3000:3000`). Don't expose Graph Memory directly to the internet. Put a reverse proxy in front.
- **`LOG_JSON=1`** enables structured JSON logging, useful for log aggregation services.
- **`LOG_LEVEL`** controls verbosity: `debug`, `info`, `warn`, or `error`.
- **Redis health check** ensures Graph Memory doesn't start until Redis is ready.

## The config file

Your `graph-memory.yaml` needs container-relative paths:

```yaml
server:
  host: "0.0.0.0"              # bind to all interfaces inside container
  port: 3000
  modelsDir: "/data/models"
  jwtSecret: "your-secret-here-at-least-32-characters-long"
  redis:
    enabled: true
    url: "redis://redis:6379"  # service name from docker-compose

users:
  admin:
    passwordHash: "$scrypt$..."    # generate with: graphmemory users add
    apiKey: "gm_..."               # for programmatic MCP access

projects:
  my-app:
    projectDir: "/data/projects/my-app"
```

**Important:** always set `host: "0.0.0.0"` inside the container. The default `127.0.0.1` would only accept connections from within the container itself.

## Volume mounts explained

| Container path | Purpose | Mount type |
|---------------|---------|------------|
| `/data/config/graph-memory.yaml` | Configuration file | Bind mount, read-only |
| `/data/projects/<name>` | Project source code | Bind mount |
| `/data/models` | Embedding model cache (~560 MB) | Named volume |

### Model cache

The default embedding model (Xenova/bge-m3) downloads on first startup. Use a **named volume** for `/data/models` so you don't re-download 560 MB every time the container restarts.

### Project directory access

Mount project directories as **read-only** (`:ro`) if you only need docs, code, and file indexing. If you use knowledge, tasks, or skills, remove `:ro` -- the file mirror needs write access to create `.notes/`, `.tasks/`, and `.skills/` directories inside the project.

## Production checklist

### 1. Set a JWT secret

The `jwtSecret` must be at least 32 characters. It signs authentication tokens for the Web UI and API access. Without it, anyone with network access can read and modify your graphs.

```yaml
server:
  jwtSecret: "generate-a-random-string-at-least-32-chars"
```

### 2. Configure users

Add users with password hashes (for Web UI login) and/or API keys (for programmatic MCP access):

```bash
# Generate a user interactively
docker compose run --rm graphmemory users add --config /data/config/graph-memory.yaml
```

Or set API keys directly in the config:

```yaml
users:
  ci-bot:
    apiKey: "gm_your-api-key-here"
    defaultAccess: read
```

### 3. Enable Redis

Redis serves as an embedding cache. Without it, embeddings are computed fresh every time a node is created or updated. With Redis, repeated embeddings of the same content are cached, which speeds up re-indexing significantly.

```yaml
server:
  redis:
    enabled: true
    url: "redis://redis:6379"
```

### 4. Set up a reverse proxy

Graph Memory listens on HTTP. For production, put nginx, Caddy, or Traefik in front for TLS termination:

```nginx
server {
    listen 443 ssl;
    server_name memory.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

The `Upgrade` and `Connection` headers are required for WebSocket support (real-time UI updates).

## Health check

The Docker image includes a built-in health check that hits the `/api/auth/status` endpoint every 30 seconds:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/auth/status').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"
```

The 30-second start period gives the embedding model time to download on first boot. Monitor health with:

```bash
docker inspect --format='{{.State.Health.Status}}' graph-memory
```

## Graceful shutdown

Graph Memory handles `SIGTERM` and `SIGINT` signals. On shutdown, it:

1. Stops accepting new connections
2. Drains all pending mutation queues
3. Closes file watchers and mirror watchers
4. Saves all dirty graphs to disk
5. Force exits after 5 seconds if graceful shutdown hangs

This means `docker compose down` and `docker stop` both result in clean shutdowns with no data loss.

## Multiple projects

Mount each project directory and list them in the config:

```yaml
projects:
  frontend:
    projectDir: "/data/projects/frontend"
  backend:
    projectDir: "/data/projects/backend"
  docs:
    projectDir: "/data/projects/docs"
```

```yaml
# docker-compose.yml
volumes:
  - /srv/code/frontend:/data/projects/frontend
  - /srv/code/backend:/data/projects/backend
  - /srv/code/docs:/data/projects/docs:ro
```

Each project gets its own MCP endpoint: `/mcp/frontend`, `/mcp/backend`, `/mcp/docs`.

## Other Docker commands

```bash
# Force re-index all projects
docker compose run --rm graphmemory \
  serve --config /data/config/graph-memory.yaml --reindex

# One-shot index (index and exit, no server)
docker compose run --rm graphmemory \
  index --config /data/config/graph-memory.yaml

# Add a user interactively
docker compose run --rm graphmemory \
  users add --config /data/config/graph-memory.yaml
```

## The Dockerfile

Graph Memory uses a multi-stage build. The first stage installs all dependencies and builds the TypeScript server and React UI. The runtime stage copies only the compiled output and production dependencies. The image runs as a non-root `app` user.

```
Stage 1 (deps):    npm ci for server + UI
Stage 2 (build):   tsc → dist/, vite → ui/dist/
Stage 3 (runtime): node:24-slim + production deps + compiled output
```

The base image is `node:24-slim` -- minimal Debian with Node.js, no extra packages. Multi-arch builds are handled by GitHub Actions with QEMU + Buildx, producing images for both `linux/amd64` and `linux/arm64`.

---

That's a complete production setup. Config file, Docker Compose, Redis, authentication, reverse proxy, and health monitoring. The server handles the rest -- indexing, embedding, real-time sync, and graceful shutdown.

[Full Docker documentation](/docs/getting-started/docker) | [Configuration reference](/docs/configuration)
